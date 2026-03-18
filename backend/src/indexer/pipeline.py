import asyncio
import os
import time
from pathlib import Path

from ..config import settings
from ..embedding.gemini import EmbeddingClient
from ..storage.chroma import VectorStore
from ..thumbnails import save_thumbnail
from .processors import PROCESSOR_REGISTRY


class IndexingPipeline:
    def __init__(
        self,
        store: VectorStore,
        embedder: EmbeddingClient,
    ):
        self.store = store
        self.embedder = embedder
        self._cancel = False
        self._is_indexing = False
        self._indexed_count = 0
        self._error_count = 0
        self._current_file = ""

    @property
    def is_indexing(self) -> bool:
        return self._is_indexing

    @property
    def status(self) -> dict:
        return {
            "is_indexing": self._is_indexing,
            "indexed_count": self._indexed_count,
            "error_count": self._error_count,
            "current_file": self._current_file,
        }

    def cancel(self) -> None:
        self._cancel = True

    def _should_index(self, file_path: Path) -> bool:
        # Check extension
        modality = settings.get_modality(file_path.suffix)
        if modality is None:
            return False

        # Check file size
        try:
            size = file_path.stat().st_size
            if size == 0 or size > settings.max_file_size_mb * 1024 * 1024:
                return False
        except OSError:
            return False

        # Check exclude patterns
        for part in file_path.parts:
            for pattern in settings.exclude_patterns:
                if part == pattern or (pattern.startswith(".") and part.startswith(".")):
                    return False

        # Check mtime vs last indexed
        meta = self.store.get_metadata(str(file_path))
        if meta:
            indexed_at = meta.get("indexed_at", 0.0)
            try:
                mtime = file_path.stat().st_mtime
                if mtime <= indexed_at:
                    return False
            except OSError:
                return False

        return True

    async def index_file(self, file_path: Path) -> bool:
        modality = settings.get_modality(file_path.suffix)
        if modality is None:
            return False

        processor = PROCESSOR_REGISTRY.get(modality)
        if processor is None:
            return False

        try:
            self._current_file = str(file_path)

            # Process file (extract content, thumbnail)
            content = await asyncio.to_thread(processor.process, file_path)

            if not content.embedding_parts:
                return False

            # Embed
            if len(content.embedding_parts) == 1 and isinstance(
                content.embedding_parts[0], str
            ):
                embedding = await self.embedder.embed_text(content.embedding_parts[0])
            elif len(content.embedding_parts) == 1:
                # Single non-text part (image)
                embedding = await self.embedder.embed_multimodal(
                    content.embedding_parts
                )
            else:
                embedding = await self.embedder.embed_multimodal(
                    content.embedding_parts
                )

            # Save thumbnail
            thumb_filename = None
            if content.thumbnail_bytes:
                thumb_filename = save_thumbnail(
                    str(file_path), content.thumbnail_bytes
                )

            # Store in ChromaDB
            file_size = file_path.stat().st_size
            self.store.upsert(
                file_path=str(file_path),
                embedding=embedding,
                modality=modality,
                text_summary=content.text_summary,
                thumbnail_filename=thumb_filename,
                file_size=file_size,
            )

            return True
        except Exception as e:
            print(f"Error indexing {file_path}: {e}")
            return False

    async def index_folder(
        self,
        folder: Path,
        limit: int | None = None,
    ) -> dict:
        self._is_indexing = True
        self._cancel = False
        self._indexed_count = 0
        self._error_count = 0
        skipped = 0
        start_time = time.time()

        try:
            files_to_index = []
            for root, dirs, files in os.walk(folder):
                if self._cancel:
                    break
                # Filter excluded directories in-place
                dirs[:] = [
                    d for d in dirs
                    if d not in settings.exclude_patterns
                    and not (d.startswith(".") and ".*" in settings.exclude_patterns)
                ]
                for fname in files:
                    fp = Path(root) / fname
                    if self._should_index(fp):
                        files_to_index.append(fp)
                    else:
                        skipped += 1
                    if limit and len(files_to_index) >= limit:
                        break
                if limit and len(files_to_index) >= limit:
                    break

            print(f"Found {len(files_to_index)} files to index (skipped {skipped})")

            for fp in files_to_index:
                if self._cancel:
                    print("Indexing cancelled.")
                    break
                success = await self.index_file(fp)
                if success:
                    self._indexed_count += 1
                    print(f"[{self._indexed_count}] Indexed: {fp.name}")
                else:
                    self._error_count += 1

            elapsed = time.time() - start_time
            return {
                "indexed": self._indexed_count,
                "errors": self._error_count,
                "skipped": skipped,
                "elapsed_seconds": round(elapsed, 1),
                "cancelled": self._cancel,
            }
        finally:
            self._is_indexing = False
            self._current_file = ""

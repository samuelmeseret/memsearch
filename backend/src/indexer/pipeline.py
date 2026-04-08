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
        self._total_files_found = 0
        self._errors: list[dict] = []
        self._folder_progress: dict[str, dict] = {}
        self._start_time: float | None = None

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
            "total_files_found": self._total_files_found,
            "errors": self._errors,
            "folder_progress": self._folder_progress,
            "start_time": self._start_time,
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
            if len(self._errors) < 100:
                self._errors.append({"file_path": str(file_path), "error": str(e)})
            return False

    def _scan_folder(self, folder: Path, limit_remaining: int | None) -> tuple[list[Path], int]:
        """Walk a folder and return (files_to_index, skipped_count)."""
        files = []
        skipped = 0
        for root, dirs, filenames in os.walk(folder):
            if self._cancel:
                break
            dirs[:] = [
                d for d in dirs
                if d not in settings.exclude_patterns
                and not (d.startswith(".") and ".*" in settings.exclude_patterns)
            ]
            for fname in filenames:
                fp = Path(root) / fname
                if self._should_index(fp):
                    files.append(fp)
                else:
                    skipped += 1
                if limit_remaining and len(files) >= limit_remaining:
                    break
            if limit_remaining and len(files) >= limit_remaining:
                break
        return files, skipped

    async def index_folders(
        self,
        folders: list[Path],
        limit: int | None = None,
    ) -> dict:
        """Index multiple folders in one session with unified progress tracking."""
        self._is_indexing = True
        self._cancel = False
        self._indexed_count = 0
        self._error_count = 0
        self._total_files_found = 0
        self._errors = []
        self._folder_progress = {}
        self._start_time = time.time()
        total_skipped = 0

        try:
            # Phase 1: Scan all folders to get total file count
            all_files: list[tuple[Path, str]] = []  # (file_path, folder_key)
            for folder in folders:
                if self._cancel:
                    break
                folder_key = str(folder)
                limit_remaining = (limit - len(all_files)) if limit else None
                if limit_remaining is not None and limit_remaining <= 0:
                    break
                found, skipped = self._scan_folder(folder, limit_remaining)
                total_skipped += skipped
                self._folder_progress[folder_key] = {
                    "total": len(found),
                    "indexed": 0,
                    "errors": 0,
                }
                for fp in found:
                    all_files.append((fp, folder_key))

            self._total_files_found = len(all_files)
            print(f"Found {self._total_files_found} files to index (skipped {total_skipped})")

            # Phase 2: Index all files
            for fp, folder_key in all_files:
                if self._cancel:
                    print("Indexing cancelled.")
                    break
                success = await self.index_file(fp)
                if success:
                    self._indexed_count += 1
                    self._folder_progress[folder_key]["indexed"] += 1
                    print(f"[{self._indexed_count}] Indexed: {fp.name}")
                else:
                    self._error_count += 1
                    self._folder_progress[folder_key]["errors"] += 1

            elapsed = time.time() - self._start_time
            return {
                "indexed": self._indexed_count,
                "errors": self._error_count,
                "skipped": total_skipped,
                "elapsed_seconds": round(elapsed, 1),
                "cancelled": self._cancel,
            }
        finally:
            self._is_indexing = False
            self._current_file = ""

    async def index_folder(
        self,
        folder: Path,
        limit: int | None = None,
    ) -> dict:
        """Index a single folder. Convenience wrapper around index_folders."""
        return await self.index_folders([folder], limit=limit)

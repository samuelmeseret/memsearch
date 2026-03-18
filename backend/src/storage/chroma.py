import hashlib
import time
from pathlib import Path

import chromadb
from pydantic import BaseModel

from ..config import settings


class SearchResult(BaseModel):
    file_path: str
    score: float
    modality: str
    filename: str
    thumbnail_filename: str | None = None
    text_summary: str = ""
    file_size: int = 0
    indexed_at: float = 0.0


class VectorStore:
    def __init__(self, chroma_dir: Path | None = None):
        chroma_dir = chroma_dir or settings.chroma_dir
        chroma_dir.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(chroma_dir))
        self._collection = self._client.get_or_create_collection(
            name=settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    @staticmethod
    def file_id(file_path: str) -> str:
        return hashlib.sha256(file_path.encode()).hexdigest()

    def upsert(
        self,
        file_path: str,
        embedding: list[float],
        modality: str,
        text_summary: str = "",
        thumbnail_filename: str | None = None,
        file_size: int = 0,
    ) -> None:
        fid = self.file_id(file_path)
        metadata = {
            "file_path": file_path,
            "modality": modality,
            "filename": Path(file_path).name,
            "text_summary": text_summary[:1000],
            "file_size": file_size,
            "indexed_at": time.time(),
        }
        if thumbnail_filename:
            metadata["thumbnail_filename"] = thumbnail_filename
        self._collection.upsert(
            ids=[fid],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[text_summary[:1000] or Path(file_path).name],
        )

    def upsert_batch(
        self,
        file_paths: list[str],
        embeddings: list[list[float]],
        metadatas: list[dict],
        documents: list[str],
    ) -> None:
        ids = [self.file_id(fp) for fp in file_paths]
        self._collection.upsert(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )

    def query(
        self,
        query_embedding: list[float],
        n_results: int = 20,
        modality_filter: str | None = None,
    ) -> list[SearchResult]:
        where = {"modality": modality_filter} if modality_filter else None
        count = self._collection.count()
        if count == 0:
            return []
        n = min(n_results, count)
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=n,
            where=where,
            include=["metadatas", "distances"],
        )
        search_results = []
        if results["metadatas"] and results["distances"]:
            for meta, dist in zip(results["metadatas"][0], results["distances"][0]):
                score = 1.0 - dist  # cosine distance → similarity
                search_results.append(
                    SearchResult(
                        file_path=meta["file_path"],
                        score=round(score, 4),
                        modality=meta["modality"],
                        filename=meta["filename"],
                        thumbnail_filename=meta.get("thumbnail_filename"),
                        text_summary=meta.get("text_summary", ""),
                        file_size=meta.get("file_size", 0),
                        indexed_at=meta.get("indexed_at", 0.0),
                    )
                )
        return search_results

    def delete(self, file_path: str) -> None:
        fid = self.file_id(file_path)
        self._collection.delete(ids=[fid])

    def count(self) -> int:
        return self._collection.count()

    def get_metadata(self, file_path: str) -> dict | None:
        fid = self.file_id(file_path)
        result = self._collection.get(ids=[fid], include=["metadatas"])
        if result["metadatas"]:
            return result["metadatas"][0]
        return None

    def clear(self) -> None:
        self._client.delete_collection(settings.collection_name)
        self._collection = self._client.get_or_create_collection(
            name=settings.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def stats(self) -> dict:
        count = self.count()
        if count == 0:
            return {"total": 0, "modalities": {}, "last_indexed_at": None}
        # Sample to get modality distribution
        sample = self._collection.get(
            include=["metadatas"],
            limit=min(count, 10000),
        )
        modalities: dict[str, int] = {}
        last_indexed = 0.0
        for meta in sample["metadatas"] or []:
            mod = meta.get("modality", "unknown")
            modalities[mod] = modalities.get(mod, 0) + 1
            ts = meta.get("indexed_at", 0.0)
            if ts > last_indexed:
                last_indexed = ts
        return {
            "total": count,
            "modalities": modalities,
            "last_indexed_at": last_indexed if last_indexed > 0 else None,
        }

import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .config import settings
from .embedding.gemini import EmbeddingClient
from .storage.chroma import VectorStore
from .indexer.pipeline import IndexingPipeline
from .thumbnails import clear_thumbnails


# Shared state
class AppState:
    store: VectorStore
    embedder: EmbeddingClient
    pipeline: IndexingPipeline


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.store = VectorStore()
    state.embedder = EmbeddingClient()
    state.pipeline = IndexingPipeline(state.store, state.embedder)
    yield


app = FastAPI(title="MemSearch", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models

class SearchRequest(BaseModel):
    query: str
    n_results: int = 20
    modality: str | None = None


class SearchResponse(BaseModel):
    results: list[dict]
    query_time_ms: float
    total_indexed: int


class IndexRequest(BaseModel):
    folders: list[str] | None = None
    limit: int | None = None


class ConfigUpdate(BaseModel):
    watched_folders: list[str] | None = None
    max_file_size_mb: int | None = None


class PhotosIndexRequest(BaseModel):
    limit: int | None = None
    favorites_only: bool = False


# Endpoints

@app.post("/search")
async def search(req: SearchRequest) -> SearchResponse:
    start = time.time()
    query_embedding = await state.embedder.embed_query(req.query)
    results = state.store.query(
        query_embedding,
        n_results=req.n_results,
        modality_filter=req.modality,
    )
    elapsed = (time.time() - start) * 1000
    return SearchResponse(
        results=[r.model_dump() for r in results],
        query_time_ms=round(elapsed, 1),
        total_indexed=state.store.count(),
    )


@app.get("/status")
async def status():
    stats = state.store.stats()
    pipeline_status = state.pipeline.status
    return {
        **stats,
        **pipeline_status,
    }


@app.post("/index/start")
async def start_indexing(req: IndexRequest | None = None):
    if state.pipeline.is_indexing:
        raise HTTPException(400, "Indexing already in progress")

    folders = (req.folders if req and req.folders else settings.watched_folders)
    limit = req.limit if req else None

    async def _run():
        for folder in folders:
            p = Path(folder).expanduser().resolve()
            if p.is_dir():
                await state.pipeline.index_folder(p, limit=limit)

    asyncio.create_task(_run())
    return {"status": "started", "folders": folders}


@app.post("/index/photos")
async def start_photos_indexing(req: PhotosIndexRequest | None = None):
    """Index photos directly from iCloud Photos library."""
    from .indexer.photos import PhotosIndexer

    photos_indexer = PhotosIndexer(state.store, state.embedder)

    async def _run():
        await photos_indexer.index_photos(
            limit=req.limit if req else None,
            favorites_only=req.favorites_only if req else False,
        )

    asyncio.create_task(_run())
    return {"status": "started", "source": "icloud_photos"}


@app.post("/index/stop")
async def stop_indexing():
    state.pipeline.cancel()
    return {"status": "cancelling"}


@app.get("/config")
async def get_config():
    return {
        "watched_folders": settings.watched_folders,
        "max_file_size_mb": settings.max_file_size_mb,
        "embedding_model": settings.embedding_model,
        "embedding_dimensions": settings.embedding_dimensions,
        "port": settings.port,
    }


@app.put("/config")
async def update_config(update: ConfigUpdate):
    if update.watched_folders is not None:
        settings.watched_folders = update.watched_folders
    if update.max_file_size_mb is not None:
        settings.max_file_size_mb = update.max_file_size_mb
    return {"status": "updated"}


@app.delete("/index")
async def clear_index():
    count = state.store.count()
    state.store.clear()
    thumbs = clear_thumbnails()
    return {"cleared_embeddings": count, "cleared_thumbnails": thumbs}


@app.get("/thumbnails/{filename}")
async def get_thumbnail(filename: str):
    # Sanitize filename to prevent path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = settings.thumbnail_dir / filename
    if not path.exists():
        raise HTTPException(404, "Thumbnail not found")
    return FileResponse(path, media_type="image/jpeg")

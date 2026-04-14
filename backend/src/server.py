import asyncio
import re
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
from .indexer.people import PeopleDatabase
from .indexer.watcher import FileWatcher
from .thumbnails import clear_thumbnails


# Shared state
class AppState:
    store: VectorStore
    embedder: EmbeddingClient
    pipeline: IndexingPipeline
    people_db: PeopleDatabase | None = None
    watcher: FileWatcher | None = None
    photos_indexer: "PhotosIndexer | None" = None


state = AppState()


def parse_people_query(query: str) -> tuple[list[str], str]:
    """Extract @mentions from query. Returns (person_names, remaining_query)."""
    pattern = r'@"([^"]+)"|@(\S+)'
    mentions = []
    for match in re.finditer(pattern, query):
        name = match.group(1) or match.group(2)
        mentions.append(name)
    remaining = re.sub(pattern, "", query).strip()
    return mentions, remaining


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.store = VectorStore()
    state.embedder = EmbeddingClient()
    state.pipeline = IndexingPipeline(state.store, state.embedder)
    state.people_db = PeopleDatabase()

    # Start file watcher if auto-indexing is enabled
    if settings.auto_index_enabled:
        state.watcher = FileWatcher(state.pipeline, state.store)
        state.watcher.start(settings.watched_folders)

    yield

    # Cleanup watcher on shutdown
    if state.watcher:
        state.watcher.stop()


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
    auto_index_enabled: bool | None = None
    index_photos_enabled: bool | None = None


class PhotosIndexRequest(BaseModel):
    limit: int | None = None
    favorites_only: bool = False


# Endpoints

@app.post("/search")
async def search(req: SearchRequest) -> SearchResponse:
    start = time.time()

    # Parse @mentions for person filtering
    person_names, semantic_query = parse_people_query(req.query)
    if person_names and not semantic_query:
        semantic_query = "photo"

    try:
        query_embedding = await state.embedder.embed_query(semantic_query or req.query)
    except Exception as e:
        msg = str(e)
        if "403" in msg or "PERMISSION_DENIED" in msg:
            raise HTTPException(503, f"Embedding API access denied — check your Gemini API key: {msg}")
        elif "404" in msg or "not found" in msg.lower():
            raise HTTPException(503, f"Embedding model not found — the model may have been renamed: {msg}")
        elif "429" in msg:
            raise HTTPException(503, f"Embedding API rate limited — try again shortly: {msg}")
        raise HTTPException(503, f"Embedding API error: {msg}")

    results = state.store.query(
        query_embedding,
        n_results=req.n_results,
        modality_filter=req.modality,
        person_names_filter=person_names or None,
    )
    elapsed = (time.time() - start) * 1000
    return SearchResponse(
        results=[r.model_dump() for r in results],
        query_time_ms=round(elapsed, 1),
        total_indexed=state.store.count(),
    )


@app.get("/status")
async def status():
    # Run stats() in a thread so it doesn't block the event loop
    stats = await asyncio.to_thread(state.store.stats)
    pipeline_status = state.pipeline.status
    source: str | None = "files" if state.pipeline.is_indexing else None
    phase: str | None = None
    last_error: str | None = None
    last_result: dict | None = None

    # Merge photos indexer status. While active, it replaces the pipeline
    # block. When idle, we still surface its last_error/last_result so the
    # UI can show why a just-clicked run silently returned.
    if state.photos_indexer:
        ps = state.photos_indexer.status
        if ps["is_indexing"]:
            pipeline_status = {
                "is_indexing": True,
                "indexed_count": ps["indexed_count"],
                "error_count": ps["error_count"],
                "current_file": ps.get("current_asset", ""),
                "total_files_found": ps.get("total_to_index", 0),
                "errors": [],
                "folder_progress": {},
                "start_time": ps.get("start_time"),
            }
            source = "photos"
            phase = ps.get("phase")
        elif not state.pipeline.is_indexing:
            # Expose the latest photos outcome for ~60s so the UI can display it.
            finished_at = ps.get("last_finished_at") or 0.0
            if finished_at and time.time() - finished_at < 60:
                source = "photos"
                phase = ps.get("phase")
                last_error = ps.get("last_error")
                last_result = ps.get("last_result")

    return {
        **stats,
        **pipeline_status,
        "source": source,
        "phase": phase,
        "last_error": last_error,
        "last_result": last_result,
    }


@app.post("/index/start")
async def start_indexing(req: IndexRequest | None = None):
    if state.pipeline.is_indexing or (state.photos_indexer and state.photos_indexer.is_indexing):
        raise HTTPException(400, "Indexing already in progress")

    folders = (req.folders if req and req.folders else settings.watched_folders)
    limit = req.limit if req else None

    async def _run():
        resolved = [
            Path(f).expanduser().resolve()
            for f in folders
            if Path(f).expanduser().resolve().is_dir()
        ]
        if resolved:
            await state.pipeline.index_folders(resolved, limit=limit)

    asyncio.create_task(_run())
    return {"status": "started", "folders": folders}


@app.post("/index/photos")
async def start_photos_indexing(req: PhotosIndexRequest | None = None):
    """Index photos directly from iCloud Photos library."""
    from .indexer.photos import PhotosIndexer, check_photos_access

    if state.pipeline.is_indexing or (state.photos_indexer and state.photos_indexer.is_indexing):
        raise HTTPException(400, "Indexing already in progress")

    # Check Photos access synchronously so the user gets immediate feedback
    # if permission hasn't been granted, instead of a silent no-op.
    access = await asyncio.to_thread(check_photos_access)
    if access != "authorized":
        raise HTTPException(
            403,
            "Photos access not authorized. Grant access in System Settings → Privacy & Security → Photos, then try again.",
        )

    # Refresh people data before indexing
    if state.people_db:
        state.people_db.refresh()

    indexer = PhotosIndexer(state.store, state.embedder, state.people_db)
    # Mark in-progress NOW so a UI refresh right after this call sees it,
    # rather than racing the background thread.
    indexer.begin()
    state.photos_indexer = indexer

    async def _run():
        try:
            await asyncio.to_thread(
                indexer.index_photos,
                limit=req.limit if req else None,
                favorites_only=req.favorites_only if req else False,
            )
        except Exception as e:
            # index_photos also records this, but log here in case it escapes.
            print(f"Photos indexing task failed: {e}")

    asyncio.create_task(_run())
    return {"status": "started", "source": "icloud_photos"}


@app.post("/index/stop")
async def stop_indexing():
    state.pipeline.cancel()
    if state.photos_indexer:
        state.photos_indexer.cancel()
    return {"status": "cancelling"}


@app.get("/people")
async def list_people():
    """Return all named people from Apple Photos for autocomplete."""
    if state.people_db:
        state.people_db.refresh_if_stale()
        if state.people_db.is_available:
            persons = state.people_db.get_all_persons()
            return {
                "people": [
                    {"name": p.display_name, "face_count": p.face_count}
                    for p in persons
                ]
            }
    return {"people": []}


@app.post("/people/refresh")
async def refresh_people():
    """Force-refresh people data from Photos.sqlite and backfill indexed photos."""
    if not state.people_db:
        raise HTTPException(400, "People database not available")

    state.people_db.refresh()
    if not state.people_db.is_available:
        raise HTTPException(500, "Could not read Photos.sqlite")

    persons = state.people_db.get_all_persons()

    # Backfill person names on already-indexed photos
    all_data = state.store._collection.get(
        where={"modality": "image"},
        include=["metadatas"],
    )

    updated = 0
    if all_data["ids"]:
        for doc_id, meta in zip(all_data["ids"], all_data["metadatas"]):
            file_path = meta.get("file_path", "")
            if not file_path.startswith("photos://"):
                continue
            asset_uuid = file_path.replace("photos://", "").split("/")[0]
            person_names = state.people_db.get_persons_for_asset(asset_uuid)
            if person_names:
                meta["person_names"] = ",".join(person_names)
                state.store._collection.update(ids=[doc_id], metadatas=[meta])
                updated += 1

    return {
        "status": "refreshed",
        "people_count": len(persons),
        "photos_updated": updated,
    }


@app.get("/config")
async def get_config():
    return {
        "watched_folders": settings.watched_folders,
        "max_file_size_mb": settings.max_file_size_mb,
        "auto_index_enabled": settings.auto_index_enabled,
        "index_photos_enabled": settings.index_photos_enabled,
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
    if update.auto_index_enabled is not None:
        settings.auto_index_enabled = update.auto_index_enabled
    if update.index_photos_enabled is not None:
        settings.index_photos_enabled = update.index_photos_enabled
    settings.save_to_disk()

    # Manage file watcher based on auto_index_enabled
    if settings.auto_index_enabled:
        if state.watcher is None:
            state.watcher = FileWatcher(state.pipeline, state.store)
        if not state.watcher.is_running:
            state.watcher.start(settings.watched_folders)
        elif update.watched_folders is not None:
            state.watcher.update_folders(settings.watched_folders)
    else:
        if state.watcher and state.watcher.is_running:
            state.watcher.stop()

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

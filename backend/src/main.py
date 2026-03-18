import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from .config import settings
from .embedding.gemini import EmbeddingClient
from .storage.chroma import VectorStore
from .indexer.pipeline import IndexingPipeline


def cmd_index(args):
    folder = Path(args.folder).expanduser().resolve()
    if not folder.is_dir():
        print(f"Error: {folder} is not a directory")
        sys.exit(1)

    if not settings.gemini_api_key:
        print("Error: GEMINI_API_KEY not set. Add it to .env or environment.")
        sys.exit(1)

    store = VectorStore()
    embedder = EmbeddingClient()
    pipeline = IndexingPipeline(store, embedder)

    print(f"Indexing {folder}...")
    limit = args.limit if hasattr(args, "limit") and args.limit else None
    result = asyncio.run(pipeline.index_folder(folder, limit=limit))
    print(f"\nDone! Indexed {result['indexed']} files in {result['elapsed_seconds']}s")
    if result["errors"]:
        print(f"  Errors: {result['errors']}")
    if result["skipped"]:
        print(f"  Skipped: {result['skipped']}")


def cmd_search(args):
    if not settings.gemini_api_key:
        print("Error: GEMINI_API_KEY not set.")
        sys.exit(1)

    store = VectorStore()
    embedder = EmbeddingClient()

    query = args.query
    n = args.num if hasattr(args, "num") else 10
    modality = args.modality if hasattr(args, "modality") else None

    print(f"Searching for: \"{query}\"")
    query_embedding = embedder.embed_query_sync(query)
    results = store.query(query_embedding, n_results=n, modality_filter=modality)

    if not results:
        print("No results found.")
        return

    print(f"\nFound {len(results)} results:\n")
    for i, r in enumerate(results, 1):
        score_pct = f"{r.score * 100:.1f}%"
        print(f"  {i}. [{score_pct}] {r.filename}")
        print(f"     {r.file_path}")
        if r.text_summary:
            summary = r.text_summary[:80]
            print(f"     {summary}")
        print()


def cmd_status(_args):
    store = VectorStore()
    stats = store.stats()
    print("Index Status:")
    print(f"  Total files: {stats['total']}")
    if stats["modalities"]:
        print("  Modalities:")
        for mod, count in sorted(stats["modalities"].items()):
            print(f"    {mod}: {count}")
    if stats["last_indexed_at"]:
        import datetime
        ts = datetime.datetime.fromtimestamp(stats["last_indexed_at"])
        print(f"  Last indexed: {ts.strftime('%Y-%m-%d %H:%M:%S')}")


def cmd_clear(_args):
    store = VectorStore()
    count = store.count()
    if count == 0:
        print("Index is already empty.")
        return
    store.clear()
    from .thumbnails import clear_thumbnails
    cleared = clear_thumbnails()
    print(f"Cleared {count} embeddings and {cleared} thumbnails.")


def cmd_photos(args):
    if not settings.gemini_api_key:
        print("Error: GEMINI_API_KEY not set. Add it to .env or environment.")
        sys.exit(1)

    from .indexer.photos import PhotosIndexer

    store = VectorStore()
    embedder = EmbeddingClient()
    indexer = PhotosIndexer(store, embedder)

    limit = args.limit if hasattr(args, "limit") and args.limit else None
    favorites = args.favorites if hasattr(args, "favorites") else False

    print("Connecting to iCloud Photos library...")
    # Must run synchronously on main thread — PhotoKit callbacks need the main run loop
    result = indexer.index_photos(
        limit=limit,
        images_only=True,
        favorites_only=favorites,
    )

    if "error" in result:
        print(f"\nError: {result['error']}")
        sys.exit(1)

    print(f"\nDone! Indexed {result['indexed']} photos in {result['elapsed_seconds']}s")
    print(f"  Total assets found: {result['total_assets']}")
    if result["errors"]:
        print(f"  Errors: {result['errors']}")
    if result["skipped"]:
        print(f"  Skipped (already indexed): {result['skipped']}")


def cmd_serve(_args):
    import uvicorn
    from .server import app

    print(f"Starting MemSearch server on {settings.host}:{settings.port}")
    uvicorn.run(app, host=settings.host, port=settings.port)


def main():
    parser = argparse.ArgumentParser(
        prog="memsearch",
        description="Mac Memory Search — index and search local files with AI",
    )
    sub = parser.add_subparsers(dest="command", help="Command to run")

    # index
    p_index = sub.add_parser("index", help="Index files in a folder")
    p_index.add_argument("folder", help="Folder to index")
    p_index.add_argument("--limit", type=int, default=None, help="Max files to index")
    p_index.set_defaults(func=cmd_index)

    # index-photos (iCloud)
    p_photos = sub.add_parser("index-photos", help="Index photos directly from iCloud Photos")
    p_photos.add_argument("--limit", type=int, default=None, help="Max photos to index")
    p_photos.add_argument("--favorites", action="store_true", help="Only index favorites")
    p_photos.set_defaults(func=cmd_photos)

    # search
    p_search = sub.add_parser("search", help="Search indexed files")
    p_search.add_argument("query", help="Search query")
    p_search.add_argument("-n", "--num", type=int, default=10, help="Number of results")
    p_search.add_argument("-m", "--modality", choices=["image", "pdf", "text"], help="Filter by type")
    p_search.set_defaults(func=cmd_search)

    # status
    p_status = sub.add_parser("status", help="Show index status")
    p_status.set_defaults(func=cmd_status)

    # clear
    p_clear = sub.add_parser("clear", help="Clear all indexed data")
    p_clear.set_defaults(func=cmd_clear)

    # serve
    p_serve = sub.add_parser("serve", help="Start the API server")
    p_serve.set_defaults(func=cmd_serve)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()

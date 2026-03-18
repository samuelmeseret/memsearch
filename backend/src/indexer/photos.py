"""
Direct iCloud Photos connector using Apple's PhotoKit (Photos.framework).

Downloads from iCloud on-demand and embeds via Gemini with concurrent workers.
Requires macOS Photos permission (System Settings → Privacy → Photos).
"""

import datetime
import io
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import objc
from Foundation import NSRunLoop, NSDate
from Photos import (
    PHAsset,
    PHFetchOptions,
    PHImageManager,
    PHImageRequestOptions,
    PHImageRequestOptionsDeliveryModeHighQualityFormat,
    PHImageRequestOptionsResizeModeNone,
    PHImageRequestOptionsVersionCurrent,
    PHPhotoLibrary,
    PHAuthorizationStatusAuthorized,
    PHAuthorizationStatusNotDetermined,
)
from PIL import Image
from google.genai import types

from ..config import settings
from ..embedding.gemini import EmbeddingClient
from ..storage.chroma import VectorStore
from ..thumbnails import save_thumbnail


MEDIA_TYPE_IMAGE = 1
MEDIA_TYPE_VIDEO = 2
CONCURRENT_EMBEDS = 10  # Number of parallel Gemini API calls


def _pump_runloop(timeout=0.5):
    NSRunLoop.currentRunLoop().runUntilDate_(
        NSDate.dateWithTimeIntervalSinceNow_(timeout)
    )


def check_photos_access() -> str:
    status = PHPhotoLibrary.authorizationStatus()
    if status == PHAuthorizationStatusAuthorized:
        return "authorized"
    if status == PHAuthorizationStatusNotDetermined:
        result = {"done": False, "status": None}
        def handler(new_status):
            result["status"] = new_status
            result["done"] = True
        PHPhotoLibrary.requestAuthorization_(handler)
        deadline = time.time() + 60
        while not result["done"] and time.time() < deadline:
            _pump_runloop(0.5)
        if result["status"] == PHAuthorizationStatusAuthorized:
            return "authorized"
        return "denied"
    return "denied"


def fetch_all_assets(media_type: int | None = None, limit: int | None = None) -> list:
    options = PHFetchOptions.alloc().init()
    if media_type is not None:
        options.setPredicate_(
            objc.lookUpClass("NSPredicate").predicateWithFormat_(
                "mediaType == %d" % media_type
            )
        )
    options.setSortDescriptors_([
        objc.lookUpClass("NSSortDescriptor").alloc().initWithKey_ascending_(
            "creationDate", False
        )
    ])
    if limit:
        options.setFetchLimit_(limit)
    result = PHAsset.fetchAssetsWithOptions_(options)
    return [result.objectAtIndex_(i) for i in range(result.count())]


def request_image_data(asset, timeout=120.0) -> tuple[bytes | None, str | None]:
    options = PHImageRequestOptions.alloc().init()
    options.setSynchronous_(False)
    options.setNetworkAccessAllowed_(True)
    options.setVersion_(PHImageRequestOptionsVersionCurrent)
    options.setDeliveryMode_(PHImageRequestOptionsDeliveryModeHighQualityFormat)
    options.setResizeMode_(PHImageRequestOptionsResizeModeNone)

    result = {"data": None, "uti": None, "done": False, "error": None}

    def handler(imageData, dataUTI, orientation, info):
        if imageData is not None:
            result["data"] = bytes(imageData)
            result["uti"] = str(dataUTI) if dataUTI else None
        if info:
            err = info.get("PHImageErrorKey")
            if err:
                result["error"] = str(err)
            if info.get("PHImageResultIsDegradedKey", False):
                return
        result["done"] = True

    PHImageManager.defaultManager().requestImageDataAndOrientationForAsset_options_resultHandler_(
        asset, options, handler
    )
    deadline = time.time() + timeout
    while not result["done"] and time.time() < deadline:
        _pump_runloop(0.25)

    if result["error"]:
        print(f"    PhotoKit error: {result['error']}")
    if not result["done"]:
        return None, None
    return result["data"], result["uti"]


def get_asset_metadata(asset) -> dict:
    meta = {
        "local_identifier": str(asset.localIdentifier()),
        "media_type": "image" if asset.mediaType() == MEDIA_TYPE_IMAGE else "video",
        "width": asset.pixelWidth(),
        "height": asset.pixelHeight(),
        "favorite": bool(asset.isFavorite()),
    }
    if asset.creationDate():
        meta["creation_date"] = asset.creationDate().timeIntervalSince1970()
    if asset.modificationDate():
        meta["modification_date"] = asset.modificationDate().timeIntervalSince1970()
    if asset.location():
        coord = asset.location().coordinate()
        meta["latitude"] = coord[0]
        meta["longitude"] = coord[1]
    return meta


@dataclass
class PreparedPhoto:
    """Photo data ready to be embedded (downloaded + processed, not yet embedded)."""
    file_id: str
    embed_bytes: bytes
    thumbnail_bytes: bytes
    text_summary: str
    file_size: int
    asset_meta: dict


def prepare_photo(image_data: bytes, file_id: str, asset_meta: dict) -> PreparedPhoto | None:
    """Process raw image data into thumbnail + embedding-ready JPEG. CPU only, no API call."""
    try:
        img = Image.open(io.BytesIO(image_data))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Thumbnail
        thumb = img.copy()
        thumb.thumbnail((256, 256), Image.Resampling.LANCZOS)
        thumb_buf = io.BytesIO()
        thumb.save(thumb_buf, format="JPEG", quality=85)

        # Embedding image (resize if > 4MB)
        embed_buf = io.BytesIO()
        img.save(embed_buf, format="JPEG", quality=90)
        if embed_buf.tell() > 4 * 1024 * 1024:
            scale = (4 * 1024 * 1024 / embed_buf.tell()) ** 0.5
            new_size = (int(img.width * scale), int(img.height * scale))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            embed_buf = io.BytesIO()
            img.save(embed_buf, format="JPEG", quality=85)

        # Build summary
        parts = ["Photo"]
        if asset_meta.get("creation_date"):
            dt = datetime.datetime.fromtimestamp(asset_meta["creation_date"])
            parts.append(f"taken {dt.strftime('%Y-%m-%d')}")
        if asset_meta.get("favorite"):
            parts.append("(favorite)")
        parts.append(f"{asset_meta.get('width', 0)}x{asset_meta.get('height', 0)}")

        return PreparedPhoto(
            file_id=file_id,
            embed_bytes=embed_buf.getvalue(),
            thumbnail_bytes=thumb_buf.getvalue(),
            text_summary=" | ".join(parts),
            file_size=len(image_data),
            asset_meta=asset_meta,
        )
    except Exception as e:
        print(f"    Process error: {e}")
        return None


def embed_and_store(
    photo: PreparedPhoto,
    embedder: EmbeddingClient,
    store: VectorStore,
) -> bool:
    """Embed a prepared photo via Gemini and store in ChromaDB. Thread-safe."""
    try:
        part = types.Part.from_bytes(data=photo.embed_bytes, mime_type="image/jpeg")
        embedding = embedder._embed_sync([part], "RETRIEVAL_DOCUMENT")

        thumb_filename = save_thumbnail(photo.file_id, photo.thumbnail_bytes)

        store.upsert(
            file_path=photo.file_id,
            embedding=embedding,
            modality="image",
            text_summary=photo.text_summary,
            thumbnail_filename=thumb_filename,
            file_size=photo.file_size,
        )
        return True
    except Exception as e:
        print(f"    Embed/store error: {e}")
        return False


class PhotosIndexer:
    """Indexes iCloud Photos with concurrent embedding."""

    def __init__(self, store: VectorStore, embedder: EmbeddingClient):
        self.store = store
        self.embedder = embedder
        self._cancel = False
        self._is_indexing = False
        self._indexed_count = 0
        self._error_count = 0
        self._skipped_count = 0
        self._current_asset = ""

    @property
    def is_indexing(self) -> bool:
        return self._is_indexing

    @property
    def status(self) -> dict:
        return {
            "is_indexing": self._is_indexing,
            "indexed_count": self._indexed_count,
            "error_count": self._error_count,
            "skipped_count": self._skipped_count,
            "current_asset": self._current_asset,
        }

    def cancel(self):
        self._cancel = True

    def _make_file_id(self, asset) -> str:
        return f"photos://{asset.localIdentifier()}"

    def _is_already_indexed(self, asset) -> bool:
        file_id = self._make_file_id(asset)
        meta = self.store.get_metadata(file_id)
        if meta is None:
            return False
        indexed_at = meta.get("indexed_at", 0.0)
        if asset.modificationDate():
            mtime = asset.modificationDate().timeIntervalSince1970()
            return mtime <= indexed_at
        return True

    def index_photos(
        self,
        limit: int | None = None,
        images_only: bool = True,
        favorites_only: bool = False,
        batch_size: int = CONCURRENT_EMBEDS,
    ) -> dict:
        """
        Index photos with pipelined downloading and concurrent embedding.

        Strategy:
        1. Download + process photos in batches on the main thread (PhotoKit requirement)
        2. Fan out Gemini embed calls to a thread pool (N concurrent API calls)
        3. Collect results, repeat with next batch
        """
        self._is_indexing = True
        self._cancel = False
        self._indexed_count = 0
        self._error_count = 0
        self._skipped_count = 0
        start_time = time.time()

        try:
            access = check_photos_access()
            if access != "authorized":
                print("Photos access denied. Grant in System Settings → Privacy → Photos.")
                return {"error": "access_denied", "indexed": 0}

            media_type = MEDIA_TYPE_IMAGE if images_only else None
            print("Fetching photo assets from library...")
            assets = fetch_all_assets(media_type, limit)
            total = len(assets)
            print(f"Found {total} assets")
            print(f"Using {batch_size} concurrent embedding workers\n")

            # Filter to only un-indexed assets
            to_index = []
            for asset in assets:
                if self._cancel:
                    break
                meta = get_asset_metadata(asset)
                if favorites_only and not meta.get("favorite"):
                    self._skipped_count += 1
                    continue
                if self._is_already_indexed(asset):
                    self._skipped_count += 1
                    continue
                to_index.append((asset, meta))

            if self._skipped_count:
                print(f"Skipping {self._skipped_count} already-indexed photos")

            remaining = len(to_index)
            print(f"Need to index {remaining} photos\n")

            executor = ThreadPoolExecutor(max_workers=batch_size)

            # Process in batches
            for batch_start in range(0, remaining, batch_size):
                if self._cancel:
                    print("Indexing cancelled.")
                    break

                batch_end = min(batch_start + batch_size, remaining)
                batch = to_index[batch_start:batch_end]
                batch_num = batch_start // batch_size + 1
                total_batches = (remaining + batch_size - 1) // batch_size

                elapsed = time.time() - start_time
                rate = self._indexed_count / elapsed if elapsed > 0 and self._indexed_count > 0 else 0
                eta = (remaining - batch_start) / rate if rate > 0 else 0
                eta_str = f" | ETA: {int(eta//60)}m{int(eta%60)}s" if rate > 0 else ""

                print(f"── Batch {batch_num}/{total_batches} ({batch_size} photos){eta_str} ──")

                # Phase 1: Download & process on main thread
                prepared: list[PreparedPhoto] = []
                for j, (asset, meta) in enumerate(batch):
                    if self._cancel:
                        break
                    file_id = self._make_file_id(asset)
                    self._current_asset = meta.get("local_identifier", "")
                    pos = batch_start + j + 1

                    print(f"  [{pos}/{remaining}] Downloading...", end=" ", flush=True)
                    image_data, uti = request_image_data(asset)
                    if image_data is None:
                        print("FAILED")
                        self._error_count += 1
                        continue

                    photo = prepare_photo(image_data, file_id, meta)
                    if photo is None:
                        print("FAILED")
                        self._error_count += 1
                        continue

                    print(f"{len(image_data)//1024}KB", flush=True)
                    prepared.append(photo)

                if not prepared:
                    continue

                # Phase 2: Embed concurrently via thread pool
                print(f"  Embedding {len(prepared)} photos concurrently...", end=" ", flush=True)
                embed_start = time.time()

                futures = {
                    executor.submit(embed_and_store, photo, self.embedder, self.store): photo
                    for photo in prepared
                }

                for future in as_completed(futures):
                    if future.result():
                        self._indexed_count += 1
                    else:
                        self._error_count += 1

                embed_time = time.time() - embed_start
                print(f"done ({embed_time:.1f}s)\n")

            executor.shutdown(wait=False)

            elapsed = time.time() - start_time
            rate = self._indexed_count / elapsed if elapsed > 0 else 0
            print(f"\n{'='*50}")
            print(f"Indexed {self._indexed_count} photos in {elapsed:.0f}s ({rate:.1f} photos/sec)")
            if self._error_count:
                print(f"Errors: {self._error_count}")
            if self._skipped_count:
                print(f"Skipped: {self._skipped_count}")

            return {
                "indexed": self._indexed_count,
                "errors": self._error_count,
                "skipped": self._skipped_count,
                "total_assets": total,
                "elapsed_seconds": round(elapsed, 1),
                "cancelled": self._cancel,
            }
        finally:
            self._is_indexing = False
            self._current_asset = ""

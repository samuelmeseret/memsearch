import hashlib
from pathlib import Path

from .config import settings


def _thumbnail_dir() -> Path:
    d = settings.thumbnail_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def thumbnail_filename(file_path: str) -> str:
    h = hashlib.sha256(file_path.encode()).hexdigest()
    return f"{h}.jpg"


def save_thumbnail(file_path: str, image_bytes: bytes) -> str:
    fname = thumbnail_filename(file_path)
    out = _thumbnail_dir() / fname
    out.write_bytes(image_bytes)
    return fname


def get_thumbnail_path(file_path: str) -> Path | None:
    fname = thumbnail_filename(file_path)
    p = _thumbnail_dir() / fname
    return p if p.exists() else None


def clear_thumbnails() -> int:
    d = _thumbnail_dir()
    count = 0
    for f in d.glob("*.jpg"):
        f.unlink()
        count += 1
    return count

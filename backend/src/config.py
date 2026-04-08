import json
from pathlib import Path

from pydantic_settings import BaseSettings

CONFIG_FILE = Path.home() / "Library/Application Support/MacMemorySearch/config.json"

# Fields that persist to config.json (user-mutable settings)
_PERSISTENT_FIELDS = {"watched_folders", "max_file_size_mb", "auto_index_enabled", "index_photos_enabled"}


def _load_from_disk() -> dict:
    """Read persistent config from disk. Returns empty dict if file missing/corrupt."""
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        pass
    return {}


class Settings(BaseSettings):
    model_config = {"env_prefix": "MEMSEARCH_"}

    gemini_api_key: str = ""
    chroma_dir: Path = Path.home() / "Library/Application Support/MacMemorySearch/chroma"
    thumbnail_dir: Path = Path.home() / "Library/Application Support/MacMemorySearch/thumbnails"
    port: int = 7242
    host: str = "127.0.0.1"
    embedding_model: str = "gemini-embedding-2-preview"
    embedding_dimensions: int = 768
    collection_name: str = "mac_memory"
    max_concurrent_embeds: int = 5
    max_file_size_mb: int = 50
    auto_index_enabled: bool = False
    index_photos_enabled: bool = False
    photos_library_path: str = str(Path.home() / "Pictures/Photos Library.photoslibrary")
    watched_folders: list[str] = [
        str(Path.home() / "Documents"),
        str(Path.home() / "Desktop"),
        str(Path.home() / "Downloads"),
        str(Path.home() / "Pictures"),
    ]
    exclude_patterns: list[str] = [
        ".*",
        "__pycache__",
        "node_modules",
        ".git",
        ".DS_Store",
        "Thumbs.db",
    ]

    def save_to_disk(self) -> None:
        """Persist user-mutable settings to config.json."""
        data = {k: getattr(self, k) for k in _PERSISTENT_FIELDS}
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = CONFIG_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.replace(CONFIG_FILE)

    # Extension → modality mapping
    @staticmethod
    def get_modality(ext: str) -> str | None:
        ext = ext.lower().lstrip(".")
        mapping = {
            # Images
            "jpg": "image", "jpeg": "image", "png": "image",
            "gif": "image", "webp": "image", "heic": "image",
            "heif": "image", "tiff": "image", "bmp": "image",
            # PDFs
            "pdf": "pdf",
            # Text
            "txt": "text", "md": "text", "markdown": "text",
            "rst": "text", "csv": "text", "json": "text",
            "yaml": "text", "yml": "text", "toml": "text",
            "xml": "text", "html": "text", "css": "text",
            "js": "text", "ts": "text", "py": "text",
            "rb": "text", "go": "text", "rs": "text",
            "java": "text", "c": "text", "cpp": "text",
            "h": "text", "hpp": "text", "swift": "text",
            "sh": "text", "bash": "text", "zsh": "text",
            "sql": "text", "r": "text", "m": "text",
            "tex": "text", "log": "text",
        }
        return mapping.get(ext)


# Build settings: env vars take priority over disk config over defaults
settings = Settings()

# Apply disk overrides for persistent fields (lower priority than env vars)
_disk = _load_from_disk()
for _key, _val in _disk.items():
    if _key in _PERSISTENT_FIELDS:
        # Only apply disk value if the env var wasn't explicitly set
        env_name = f"MEMSEARCH_{_key.upper()}"
        import os
        if env_name not in os.environ:
            setattr(settings, _key, _val)

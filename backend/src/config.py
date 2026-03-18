from pathlib import Path

from pydantic_settings import BaseSettings


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


settings = Settings()

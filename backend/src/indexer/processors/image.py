import io
from pathlib import Path

from PIL import Image
from google.genai import types

from .base import BaseProcessor, ProcessedContent

# Register HEIC support
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
}

MAX_EMBED_SIZE = 4 * 1024 * 1024  # 4MB for embedding API
THUMBNAIL_SIZE = (256, 256)


class ImageProcessor(BaseProcessor):
    def process(self, file_path: Path) -> ProcessedContent:
        img = Image.open(file_path)

        # Convert to RGB if needed (handles RGBA, palette, etc.)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Generate thumbnail
        thumb = img.copy()
        thumb.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        thumb_buf = io.BytesIO()
        thumb.save(thumb_buf, format="JPEG", quality=85)
        thumbnail_bytes = thumb_buf.getvalue()

        # Prepare image for embedding — resize if too large
        embed_img = img
        embed_buf = io.BytesIO()
        embed_img.save(embed_buf, format="JPEG", quality=90)
        if embed_buf.tell() > MAX_EMBED_SIZE:
            # Downscale to fit
            scale = (MAX_EMBED_SIZE / embed_buf.tell()) ** 0.5
            new_size = (int(img.width * scale), int(img.height * scale))
            embed_img = img.resize(new_size, Image.Resampling.LANCZOS)
            embed_buf = io.BytesIO()
            embed_img.save(embed_buf, format="JPEG", quality=85)

        image_bytes = embed_buf.getvalue()
        part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")

        return ProcessedContent(
            text_summary=f"Image: {file_path.name} ({img.width}x{img.height})",
            embedding_parts=[part],
            thumbnail_bytes=thumbnail_bytes,
        )

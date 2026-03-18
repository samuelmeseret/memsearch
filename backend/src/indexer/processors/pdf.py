import io
from pathlib import Path

import fitz  # PyMuPDF
from google.genai import types

from .base import BaseProcessor, ProcessedContent

MAX_TEXT_CHARS = 8000
THUMBNAIL_SIZE = (256, 256)


class PDFProcessor(BaseProcessor):
    def process(self, file_path: Path) -> ProcessedContent:
        doc = fitz.open(file_path)

        # Extract text from all pages
        text_parts = []
        for page in doc:
            text = page.get_text()
            if text.strip():
                text_parts.append(text.strip())
        full_text = "\n\n".join(text_parts)[:MAX_TEXT_CHARS]

        # Render first page as image for thumbnail + embedding
        thumbnail_bytes = None
        embedding_parts: list = []

        if doc.page_count > 0:
            page = doc[0]
            # Render at 2x for quality
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("jpeg")

            # Create thumbnail (smaller render)
            thumb_mat = fitz.Matrix(0.5, 0.5)
            thumb_pix = page.get_pixmap(matrix=thumb_mat)
            thumbnail_bytes = thumb_pix.tobytes("jpeg")

            # Embedding: combine text + first page image
            if full_text:
                embedding_parts.append(full_text)
            part = types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
            embedding_parts.append(part)
        elif full_text:
            embedding_parts.append(full_text)

        doc.close()

        summary = full_text[:200] if full_text else f"PDF: {file_path.name}"

        return ProcessedContent(
            text_summary=summary,
            embedding_parts=embedding_parts,
            thumbnail_bytes=thumbnail_bytes,
        )

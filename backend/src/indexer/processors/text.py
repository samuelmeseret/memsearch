from pathlib import Path

from .base import BaseProcessor, ProcessedContent

MAX_TEXT_CHARS = 8000


class TextProcessor(BaseProcessor):
    def process(self, file_path: Path) -> ProcessedContent:
        try:
            text = file_path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            text = file_path.read_text(encoding="latin-1", errors="replace")

        text = text[:MAX_TEXT_CHARS]
        summary = text[:200].strip()

        return ProcessedContent(
            text_summary=summary,
            embedding_parts=[text] if text.strip() else [],
            thumbnail_bytes=None,
        )

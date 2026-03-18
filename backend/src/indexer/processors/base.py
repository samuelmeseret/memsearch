from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ProcessedContent:
    text_summary: str = ""
    embedding_parts: list = field(default_factory=list)
    thumbnail_bytes: bytes | None = None
    thumbnail_mime: str = "image/jpeg"


class BaseProcessor(ABC):
    @abstractmethod
    def process(self, file_path: Path) -> ProcessedContent:
        """Process a file and return content ready for embedding."""
        ...

from .base import BaseProcessor, ProcessedContent
from .image import ImageProcessor
from .pdf import PDFProcessor
from .text import TextProcessor

PROCESSOR_REGISTRY: dict[str, BaseProcessor] = {
    "image": ImageProcessor(),
    "pdf": PDFProcessor(),
    "text": TextProcessor(),
}

__all__ = [
    "BaseProcessor",
    "ProcessedContent",
    "ImageProcessor",
    "PDFProcessor",
    "TextProcessor",
    "PROCESSOR_REGISTRY",
]

import asyncio
import time

from google import genai
from google.genai import types

from ..config import settings


class EmbeddingClient:
    def __init__(self, api_key: str | None = None):
        self._client = genai.Client(api_key=api_key or settings.gemini_api_key)
        self._model = settings.embedding_model
        self._dimensions = settings.embedding_dimensions
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_embeds)

    def _embed_sync(
        self,
        contents: list,
        task_type: str,
    ) -> list[float]:
        result = self._client.models.embed_content(
            model=self._model,
            contents=contents,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=self._dimensions,
            ),
        )
        return list(result.embeddings[0].values)

    async def _embed_with_retry(
        self,
        contents: list,
        task_type: str,
        max_retries: int = 3,
    ) -> list[float]:
        async with self._semaphore:
            for attempt in range(max_retries):
                try:
                    return await asyncio.to_thread(
                        self._embed_sync, contents, task_type
                    )
                except Exception as e:
                    if "429" in str(e) and attempt < max_retries - 1:
                        wait = 2 ** (attempt + 1)
                        print(f"Rate limited, waiting {wait}s...")
                        await asyncio.sleep(wait)
                    elif attempt < max_retries - 1:
                        await asyncio.sleep(1)
                    else:
                        raise

    async def embed_text(self, text: str) -> list[float]:
        return await self._embed_with_retry(
            [text], "RETRIEVAL_DOCUMENT"
        )

    async def embed_image(self, image_bytes: bytes, mime_type: str) -> list[float]:
        part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        return await self._embed_with_retry(
            [part], "RETRIEVAL_DOCUMENT"
        )

    async def embed_multimodal(self, parts: list) -> list[float]:
        return await self._embed_with_retry(
            parts, "RETRIEVAL_DOCUMENT"
        )

    async def embed_query(self, query: str) -> list[float]:
        return await self._embed_with_retry(
            [query], "RETRIEVAL_QUERY"
        )

    def embed_text_sync(self, text: str) -> list[float]:
        return self._embed_sync([text], "RETRIEVAL_DOCUMENT")

    def embed_query_sync(self, query: str) -> list[float]:
        return self._embed_sync([query], "RETRIEVAL_QUERY")

"""Embeddings via the OpenAI embeddings endpoint, in batches."""

from app.config import get_settings
from app.services.llm import get_client
from app.services.usage import Usage


async def embed_texts(texts: list[str]) -> tuple[list[list[float]], Usage]:
    """Embed texts in order. Returns the vectors and the summed token usage.

    Raises whatever the OpenAI client raises; ingestion maps that to EMBEDDING_FAILED.
    """
    s = get_settings()
    vectors: list[list[float]] = []
    usage = Usage()
    client = get_client()
    for i in range(0, len(texts), s.embedding_batch_size):
        batch = texts[i : i + s.embedding_batch_size]
        resp = await client.embeddings.create(model=s.embedding_model, input=batch)
        # Results carry their input index; sort to be safe.
        vectors.extend(item.embedding for item in sorted(resp.data, key=lambda d: d.index))
        if resp.usage is not None:
            usage.input_tokens += int(getattr(resp.usage, "total_tokens", 0) or 0)
    if len(vectors) != len(texts):
        raise RuntimeError(f"expected {len(texts)} embeddings, got {len(vectors)}")
    return vectors, usage


async def embed_query(text: str) -> tuple[list[float], Usage]:
    """Embed a single query string (used by retrieval in Phase 3)."""
    vectors, usage = await embed_texts([text])
    return vectors[0], usage

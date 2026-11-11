"""OpenAI Responses API wrapper. Smoke-test level for now; Phase 2/3 extend it
(streaming agent loop, embeddings, OCR, usage logging)."""

from typing import Any

from openai import AsyncOpenAI

from app.config import get_settings

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        s = get_settings()
        _client = AsyncOpenAI(api_key=s.openai_api_key, timeout=s.llm_timeout_s)
    return _client


async def respond(
    prompt: str | list[dict[str, Any]],
    *,
    model: str | None = None,
    service_tier: str | None = None,
    reasoning: dict[str, Any] | None = None,
    **kwargs: Any,
) -> Any:
    """One non-streaming Responses API call using the configured chat defaults."""
    s = get_settings()
    params: dict[str, Any] = {
        "model": model or s.chat_model,
        "input": prompt,
        "service_tier": service_tier or s.chat_service_tier,
        **kwargs,
    }
    if reasoning is not None:
        params["reasoning"] = reasoning
    return await get_client().responses.create(**params)

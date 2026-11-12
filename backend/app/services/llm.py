"""OpenAI Responses API wrapper: a shared client, a one-shot call, and the streaming call the
chat agent uses (with the flex -> fallback tier retry)."""

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import openai
from openai import AsyncOpenAI

from app.config import get_settings

log = logging.getLogger("docgenie.llm")

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


class LlmError(Exception):
    """A model call failed. `code` is what the chat stream reports to the client."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


LLM_BUSY = "LLM_BUSY"
LLM_TIMEOUT = "LLM_TIMEOUT"
LLM_ERROR = "LLM_ERROR"


def to_llm_error(exc: Exception) -> LlmError:
    """Map an OpenAI SDK exception to a client-safe error (no provider internals leaked)."""
    if isinstance(exc, LlmError):
        return exc
    if isinstance(exc, openai.RateLimitError):
        return LlmError(LLM_BUSY, "The model is busy right now. Please try again in a moment.")
    if isinstance(exc, openai.APITimeoutError):
        return LlmError(LLM_TIMEOUT, "The model took too long to respond. Please try again.")
    log.warning("model call failed: %r", exc)
    return LlmError(LLM_ERROR, "The model could not complete the request. Please try again.")


@dataclass
class StreamInfo:
    """Filled in while a stream is consumed; the caller reads it afterwards."""

    requested_tier: str = ""
    service_tier: str = ""  # the tier that actually served the request
    flex_fallback: bool = False


def _is_flex_unavailable(exc: Exception) -> bool:
    """"Flex processing is temporarily unavailable". It arrives in two shapes: an HTTP 429 when
    the request is made (Phase 1 smoke test), or a generic `APIError` raised from inside the open
    stream a moment later (seen live in Phase 3). Match on the message, not the type."""
    return isinstance(exc, openai.OpenAIError) and "flex" in str(exc).lower()


# Events that carry no content: a retry after only these is invisible to the consumer.
_PRELUDE_EVENTS = frozenset({"response.created", "response.in_progress", "response.queued"})


async def stream_response(
    *,
    input_items: list[dict[str, Any]],
    instructions: str,
    tools: list[dict[str, Any]],
    tool_choice: str = "auto",
    info: StreamInfo,
) -> AsyncIterator[Any]:
    """Stream one Responses API call, yielding the SDK's raw events.

    Stateless (`store=False`): the caller replays the output items on the next step; reasoning
    items carry encrypted content so the model keeps its reasoning across tool calls. Retries
    once on `FLEX_FALLBACK_TIER` when the flex tier is unavailable at request time. Closing the
    generator (client disconnect) closes the HTTP stream so the model run is cancelled.
    """
    s = get_settings()
    tier = s.chat_service_tier
    info.requested_tier = tier
    info.service_tier = tier
    params: dict[str, Any] = {
        "model": s.chat_model,
        "input": input_items,
        "instructions": instructions,
        "tools": tools,
        "tool_choice": tool_choice,
        "reasoning": {"effort": s.chat_reasoning_effort, "summary": "auto"},
        "include": ["reasoning.encrypted_content"],
        "store": False,
        "stream": True,
    }
    client = get_client()
    tiers = [tier]
    if tier == "flex" and s.flex_fallback_tier != "flex":
        tiers.append(s.flex_fallback_tier)
    for attempt, current in enumerate(tiers):
        info.service_tier = current
        content_sent = False
        try:
            stream = await client.responses.create(service_tier=current, **params)
            async with stream:
                async for event in stream:
                    if event.type not in _PRELUDE_EVENTS:
                        content_sent = True
                    yield event
            return
        except openai.OpenAIError as exc:
            retry = attempt + 1 < len(tiers) and not content_sent and _is_flex_unavailable(exc)
            if not retry:
                raise to_llm_error(exc) from exc
            log.warning("flex tier unavailable, retrying on %s", tiers[attempt + 1])
            info.flex_fallback = True


async def generate_text(
    prompt: str, *, model: str, reasoning_effort: str = "low"
) -> tuple[str, Any]:
    """Short non-streaming completion (titles). Returns (text, response)."""
    resp = await respond(
        prompt,
        model=model,
        service_tier="default",
        reasoning={"effort": reasoning_effort},
        store=False,
    )
    return (getattr(resp, "output_text", "") or "").strip(), resp

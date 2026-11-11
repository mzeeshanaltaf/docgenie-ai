"""LLM token and cost logging into `llm_usage`.

Cost comes from `PRICING` in app/config.py keyed by (model, service_tier). A missing entry
records `cost_usd = NULL` rather than a guess. Phase 2 logs embedding and OCR usage; Phase 3
adds chat and title usage through the same helpers.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import PRICING
from app.models.billing import LlmUsage


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cached_tokens: int = 0

    def add(self, other: "Usage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.reasoning_tokens += other.reasoning_tokens
        self.cached_tokens += other.cached_tokens


def _attr(obj: Any, name: str, default: int = 0) -> int:
    value = obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)
    return int(value) if value is not None else default


def usage_from_response(resp: Any) -> Usage:
    """Read token counts from a Responses API response (or an embeddings response)."""
    raw = getattr(resp, "usage", None)
    if raw is None:
        return Usage()
    input_tokens = _attr(raw, "input_tokens", _attr(raw, "prompt_tokens"))
    if input_tokens == 0:
        input_tokens = _attr(raw, "total_tokens")  # embeddings only report prompt/total
    out_details = getattr(raw, "output_tokens_details", None)
    in_details = getattr(raw, "input_tokens_details", None)
    return Usage(
        input_tokens=input_tokens,
        output_tokens=_attr(raw, "output_tokens"),
        reasoning_tokens=_attr(out_details, "reasoning_tokens") if out_details else 0,
        cached_tokens=_attr(in_details, "cached_tokens") if in_details else 0,
    )


def compute_cost(model: str, service_tier: str | None, usage: Usage) -> Decimal | None:
    price = PRICING.get((model, service_tier or "default"))
    if price is None:
        return None
    per_in, per_out = price
    # Reasoning tokens are already included in output_tokens by the API.
    cost = (usage.input_tokens * per_in + usage.output_tokens * per_out) / 1_000_000
    return Decimal(str(round(cost, 6)))


async def log_usage(
    session: AsyncSession,
    *,
    user_id: str,
    kind: str,
    model: str,
    usage: Usage,
    service_tier: str | None = "default",
    session_id: Any = None,
) -> None:
    """Add one `llm_usage` row to the caller's transaction (the caller commits)."""
    session.add(
        LlmUsage(
            user_id=user_id,
            session_id=session_id,
            kind=kind,
            model=model,
            service_tier=service_tier,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            reasoning_tokens=usage.reasoning_tokens,
            cached_tokens=usage.cached_tokens,
            cost_usd=compute_cost(model, service_tier, usage),
        )
    )

"""Diagnose flex-tier availability and reasoning-summary output on flex.
Run from backend/:  PYTHONPATH=. uv run python scripts/smoke_flex_probe.py
"""

import asyncio

from app.config import get_settings
from app.services.llm import respond

PROMPT = (
    "A bat and a ball cost $1.10 together; the bat costs $1.00 more than the ball. "
    "Two trains 300 km apart approach at 60 and 90 km/h. When do they meet, and how far "
    "from the slower train's start? Show brief working."
)


def summary_text(resp) -> str:
    out = []
    for item in resp.output:
        if getattr(item, "type", "") == "reasoning":
            for part in getattr(item, "summary", None) or []:
                out.append(getattr(part, "text", ""))
    return " ".join(out).strip()


async def attempt(label: str, tier: str) -> bool:
    s = get_settings()
    try:
        resp = await respond(
            PROMPT,
            service_tier=tier,
            reasoning={"effort": s.chat_reasoning_effort, "summary": "auto"},
        )
        print(f"[{label}] OK tier_echo={getattr(resp, 'service_tier', None)} "
              f"reasoning_tokens={resp.usage.output_tokens_details.reasoning_tokens} "
              f"summary={summary_text(resp)[:150]!r}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[{label}] FAIL {type(exc).__name__}: {str(exc)[:200]}")
        return False


async def main() -> None:
    for i in range(1, 7):
        if await attempt(f"flex try {i}", "flex"):
            break
        await asyncio.sleep(10)


asyncio.run(main())

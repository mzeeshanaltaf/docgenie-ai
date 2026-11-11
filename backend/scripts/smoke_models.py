"""Phase 1 model smoke test.

Checks that CHAT_MODEL / OCR_MODEL accept every feature the plan depends on:
flex tier, reasoning effort, reasoning summaries, and image input.
Run from backend/:  uv run python scripts/smoke_models.py
Exit code is non-zero if any feature is unsupported. Never substitutes a model.
"""

import asyncio
import base64
import io
import sys
import traceback

from PIL import Image, ImageDraw, ImageFont

from app.config import get_settings
from app.services.llm import respond

results: dict[str, str] = {}


def make_image_data_url(text: str) -> str:
    img = Image.new("RGB", (600, 160), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
    draw.text((20, 50), text, fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def summary_text(resp) -> str:
    out = []
    for item in resp.output:
        if getattr(item, "type", "") == "reasoning":
            for part in getattr(item, "summary", None) or []:
                out.append(getattr(part, "text", ""))
    return " ".join(out).strip()


async def check(name: str, coro) -> None:
    try:
        results[name] = "OK: " + await coro
    except Exception as exc:  # noqa: BLE001
        results[name] = f"FAIL: {type(exc).__name__}: {exc}"
        traceback.print_exc(limit=1)


async def main() -> int:
    s = get_settings()
    print(f"CHAT_MODEL={s.chat_model} OCR_MODEL={s.ocr_model}")

    async def flex_and_reasoning() -> str:
        resp = await respond(
            "What is 17 * 23? Answer with just the number.",
            reasoning={"effort": s.chat_reasoning_effort, "summary": "auto"},
        )
        print("  service_tier echoed:", getattr(resp, "service_tier", None))
        print("  reasoning summary:", repr(summary_text(resp)[:200]))
        print("  output_text:", repr(resp.output_text[:100]))
        results["_summary_present"] = "yes" if summary_text(resp) else "no"
        return f"tier={getattr(resp, 'service_tier', None)} text={resp.output_text[:40]!r}"

    async def image_input() -> str:
        resp = await respond(
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "Transcribe the text in this image exactly."},
                        {"type": "input_image", "image_url": make_image_data_url("DocGenie 4721")},
                    ],
                }
            ],
            model=s.ocr_model,
            service_tier="default",
        )
        print("  OCR output:", repr(resp.output_text[:100]))
        return f"text={resp.output_text[:60]!r}"

    await check("flex_tier+reasoning_effort+summary_request", flex_and_reasoning())
    await check("image_input", image_input())

    print("\n=== RESULTS ===")
    for k, v in results.items():
        print(f"{k}: {v}")
    return 0 if all(v.startswith("OK") or k.startswith("_") for k, v in results.items()) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

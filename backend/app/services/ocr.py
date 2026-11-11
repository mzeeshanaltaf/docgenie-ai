"""Scanned-PDF fallback: render pages with pypdfium2 and transcribe them with a vision model."""

import asyncio
import base64
import io
import logging
from pathlib import Path

from app.config import get_settings
from app.services.llm import get_client
from app.services.parsing import PageText
from app.services.usage import Usage, usage_from_response

log = logging.getLogger("docgenie.ocr")

OCR_PROMPT = (
    "Transcribe all the text on this document page exactly as written, in reading order. "
    "Render tables as plain text with one row per line and cells separated by ' | '. "
    "Output only the transcribed text, with no commentary. "
    "If the page contains no text, output nothing."
)


def render_pdf_page_png(path: Path, page_index: int) -> bytes:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(path))
    try:
        page = pdf[page_index]
        image = page.render(scale=get_settings().ocr_render_scale).to_pil().convert("RGB")
        buf = io.BytesIO()
        image.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    finally:
        pdf.close()


async def _transcribe(png: bytes) -> tuple[str, Usage]:
    s = get_settings()
    data_url = "data:image/png;base64," + base64.b64encode(png).decode()
    resp = await get_client().responses.create(
        model=s.ocr_model,
        service_tier="default",
        reasoning={"effort": s.ocr_reasoning_effort},
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": OCR_PROMPT},
                    {"type": "input_image", "image_url": data_url},
                ],
            }
        ],
    )
    return (resp.output_text or "").strip(), usage_from_response(resp)


async def ocr_pdf(path: Path, num_pages: int) -> tuple[list[PageText], Usage]:
    """OCR every page (up to `num_pages`, already capped at MAX_PAGES by the upload check).

    Pages are rendered one at a time (pdfium is not thread safe) but transcribed
    concurrently, bounded by OCR_CONCURRENCY. Any page failure fails the whole job.
    """
    s = get_settings()
    total = min(num_pages, s.max_pages)
    sem = asyncio.Semaphore(s.ocr_concurrency)
    usage = Usage()

    async def one(index: int, png: bytes) -> PageText:
        try:
            text, page_usage = await _transcribe(png)
        finally:
            sem.release()
        usage.add(page_usage)
        return PageText(index + 1, text)

    tasks: list[asyncio.Task[PageText]] = []
    try:
        for i in range(total):
            # Take a slot before rendering so at most OCR_CONCURRENCY page images sit in memory.
            await sem.acquire()
            try:
                png = await asyncio.to_thread(render_pdf_page_png, path, i)
            except BaseException:
                sem.release()
                raise
            tasks.append(asyncio.create_task(one(i, png)))
        pages = list(await asyncio.gather(*tasks))
    except BaseException:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    return pages, usage

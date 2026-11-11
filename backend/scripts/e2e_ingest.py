"""End-to-end ingestion check against a RUNNING backend with the real OpenAI API.

Uploads a text PDF, a scanned PDF (OCR), a DOCX and a CSV as a throwaway user, waits for
each to reach `ready`, prints chunk/embedding counts, checks the original file streams back,
then deletes everything it created (documents via the API; the user's credit rows directly).

    uv run uvicorn app.main:app --port 8765          # in one terminal
    PYTHONPATH=. uv run python scripts/e2e_ingest.py [http://localhost:8765]

Costs a few cents of OpenAI usage (embeddings + 2 OCR page images).
"""

import asyncio
import secrets
import sys
import time

import httpx
from sqlalchemy import text

from app.config import get_settings
from app.db import dispose_engine, get_sessionmaker
from tests import factories


async def main(base: str) -> int:
    key = get_settings().internal_api_key
    uid = f"e2e_{secrets.token_hex(5)}"
    headers = {"X-Internal-Key": key, "X-User-Id": uid}
    samples = [
        ("text.pdf", factories.text_pdf(pages=3), "application/pdf"),
        ("scan.pdf", factories.scanned_pdf(pages=2), "application/pdf"),
        ("notes.docx", factories.docx_bytes(), "application/octet-stream"),
        ("data.csv", factories.csv_bytes(rows=30), "application/vnd.ms-excel"),
    ]
    failures = 0
    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=300) as c:
        print("health:", (await c.get("/v1/health")).json())
        ids: dict[str, str] = {}
        for name, data, mime in samples:
            r = await c.post("/v1/documents", files=factories.multipart(name, data, mime))
            print(f"upload {name}: {r.status_code}")
            if r.status_code != 202:
                print(r.text)
                failures += 1
                continue
            ids[name] = r.json()["id"]

        for name, doc_id in ids.items():
            started = time.time()
            while True:
                doc = (await c.get(f"/v1/documents/{doc_id}")).json()
                if doc["status"] != "processing" or time.time() - started > 280:
                    break
                await asyncio.sleep(2)
            async with get_sessionmaker()() as s:
                chunks, embedded, rows = (
                    await s.execute(
                        text(
                            "SELECT count(*), count(embedding), "
                            "(SELECT count(*) FROM document_rows WHERE document_id = :d) "
                            "FROM document_chunks WHERE document_id = :d"
                        ),
                        {"d": doc_id},
                    )
                ).one()
            orig = await c.get(f"/v1/documents/{doc_id}/content")
            ok = doc["status"] == "ready" and chunks > 0 and chunks == embedded and orig.status_code == 200
            failures += 0 if ok else 1
            print(
                f"{'PASS' if ok else 'FAIL'} {name}: status={doc['status']} error={doc['error_code']} "
                f"ocr_used={doc['ocr_used']} pages={doc['num_pages']} chunks={chunks} "
                f"embedded={embedded} csv_rows={rows} original_bytes={len(orig.content)} "
                f"({time.time() - started:.1f}s)"
            )

        async with get_sessionmaker()() as s:
            usage = (
                await s.execute(
                    text(
                        "SELECT kind, sum(input_tokens), sum(output_tokens), sum(cost_usd) "
                        "FROM llm_usage WHERE user_id = :u GROUP BY kind ORDER BY kind"
                    ),
                    {"u": uid},
                )
            ).all()
        print("llm_usage:", [tuple(r) for r in usage])
        for doc_id in ids.values():
            await c.delete(f"/v1/documents/{doc_id}")

    async with get_sessionmaker()() as s, s.begin():
        for table in ("llm_usage", "credit_transactions", "credit_accounts"):
            await s.execute(text(f"DELETE FROM {table} WHERE user_id = :u"), {"u": uid})
    await dispose_engine()
    print("cleaned up throwaway user", uid)
    return failures


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765")) else 0)

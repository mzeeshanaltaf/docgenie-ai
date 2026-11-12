"""End-to-end chat check against a RUNNING backend with the real OpenAI API.

As a throwaway user it uploads a PDF and a CSV, waits for `ready`, then chats twice over real SSE:
a question about the PDF (expects a `search_documents` trace, a cited answer, reasoning, metrics)
and a question about the CSV (expects `query_table`). It also checks the server-generated title,
the persisted messages and the usage rows, then cleans up after itself.

    uv run uvicorn app.main:app --port 8765          # in one terminal
    PYTHONPATH=. uv run python scripts/e2e_chat.py [http://localhost:8765]

Costs a few cents of OpenAI usage.
"""

import asyncio
import io
import json
import secrets
import sys
import time
import uuid

import httpx
from reportlab.pdfgen import canvas
from sqlalchemy import text

from app.config import get_settings
from app.db import dispose_engine, get_sessionmaker
from tests import factories

NOTICE_DAYS = 45
CSV = (
    b"region,units,revenue\n"
    b"North,10,1000.50\nNorth,5,499.50\nSouth,7,700\nSouth,3,300\nEast,20,2500\n"
)  # North 1500, South 1000, East 2500, total 5000


def contract_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    page1 = [
        "SERVICES AGREEMENT",
        "1. Payment. The client shall pay each invoice within 30 days of receipt.",
        "2. Confidentiality. Both parties keep the other's information confidential.",
    ]
    page2 = [
        "3. Termination. Either party may terminate this agreement by giving",
        f"{NOTICE_DAYS} days written notice to the other party.",
        "4. Governing law. This agreement is governed by the laws of Ireland.",
    ]
    for lines in (page1, page2):
        for i, line in enumerate(lines):
            c.drawString(72, 750 - i * 24, line)
        c.showPage()
    c.save()
    return buf.getvalue()


async def chat(c: httpx.AsyncClient, session_id: str, message: str) -> tuple[list[tuple[str, dict]], dict]:
    """POST /v1/chat/stream and read the SSE stream, timing the first event of each kind."""
    started = time.perf_counter()
    events: list[tuple[str, dict]] = []
    first_seen: dict[str, float] = {}
    async with c.stream(
        "POST", "/v1/chat/stream", json={"session_id": session_id, "message": message}
    ) as resp:
        assert resp.status_code == 200, (resp.status_code, await resp.aread())
        event = None
        async for line in resp.aiter_lines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: ") and event:
                events.append((event, json.loads(line[6:])))
                first_seen.setdefault(event, time.perf_counter() - started)
    return events, first_seen


def show(events, first_seen) -> None:
    order: list[str] = []
    for name, _ in events:
        if not order or order[-1] != name:
            order.append(name)
    print("  event order:", " > ".join(order))
    print("  first seen (s):", {k: round(v, 2) for k, v in first_seen.items()})
    for name, d in events:
        if name in ("tool.start", "tool.end", "citation", "error"):
            print(f"  {name}: {json.dumps(d, ensure_ascii=False)[:230]}")
    reasoning = "".join(d["text"] for n, d in events if n == "reasoning.delta")
    print(f"  reasoning summary ({len(reasoning)} chars): {reasoning[:160]!r}")
    answer = "".join(d["text"] for n, d in events if n == "text.delta")
    print(f"  answer: {answer!r}")
    end = next(d for n, d in events if n == "message.end")
    print("  metrics:", end["metrics"])


async def main(base: str) -> int:
    key = get_settings().internal_api_key
    uid = f"e2e_{secrets.token_hex(5)}"
    headers = {"X-Internal-Key": key, "X-User-Id": uid}
    failures = 0

    def check(ok: bool, label: str) -> None:
        nonlocal failures
        failures += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'} {label}")

    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=300) as c:
        ids = []
        for name, data, mime in (
            ("contract.pdf", contract_pdf(), "application/pdf"),
            ("sales.csv", CSV, "text/csv"),
        ):
            r = await c.post("/v1/documents", files=factories.multipart(name, data, mime))
            assert r.status_code == 202, r.text
            ids.append(r.json()["id"])
        for doc_id in ids:
            for _ in range(120):
                doc = (await c.get(f"/v1/documents/{doc_id}")).json()
                if doc["status"] != "processing":
                    break
                await asyncio.sleep(2)
            assert doc["status"] == "ready", doc
        print("documents ready")

        print("\n== PDF question")
        sid1 = str(uuid.uuid4())
        events, seen = await chat(
            c, sid1, "How many days of written notice are needed to terminate the agreement?"
        )
        show(events, seen)
        names = [n for n, _ in events]
        answer = "".join(d["text"] for n, d in events if n == "text.delta")
        tools = [d["name"] for n, d in events if n == "tool.start"]
        end = next(d for n, d in events if n == "message.end")
        check(names[0] == "message.start" and "message.end" in names, "start ... end")
        check("search_documents" in tools, f"search_documents was used (tools: {tools})")
        check(str(NOTICE_DAYS) in answer, f"answer mentions {NOTICE_DAYS}")
        cites = [d for n, d in events if n == "citation"]
        check(bool(cites) and cites[0]["file_name"] == "contract.pdf", "a citation points at contract.pdf")
        # Citations are chunk-level: this tiny PDF is one chunk spanning pages 1-2.
        check(
            bool(cites) and cites[0]["page_start"] <= 2 <= cites[0]["page_end"],
            f"citation page range covers page 2 (got {cites[0]['page_start']}-{cites[0]['page_end']})" if cites else "no citation",
        )
        check(end["status"] == "complete" and end["metrics"]["ttft_ms"] is not None, "complete with ttft")
        check(end["metrics"]["tokens_per_s"] is not None, "tokens/s reported")
        check("session.title" in names, f"title generated: {next((d['title'] for n, d in events if n == 'session.title'), None)!r}")
        print("  reasoning events present:", "reasoning.delta" in names, "(depends on the model)")

        print("\n== CSV question")
        sid2 = str(uuid.uuid4())
        events, seen = await chat(c, sid2, "What is the total revenue for each region in sales.csv?")
        show(events, seen)
        answer = "".join(d["text"] for n, d in events if n == "text.delta")
        ends = [d for n, d in events if n == "tool.end"]
        tools = [d["name"] for n, d in events if n == "tool.start"]
        check("query_table" in tools, f"query_table was used (tools: {tools})")
        check(all(d["ok"] for d in ends), "every tool call succeeded")
        compact = answer.replace(",", "")
        check(all(v in compact for v in ("1500", "1000", "2500")), "answer has the three regional totals")

        print("\n== a harder question (to see reasoning summaries stream)")
        sid3 = str(uuid.uuid4())
        events, seen = await chat(
            c,
            sid3,
            "Across both documents, if every region in sales.csv paid its total revenue as one "
            "invoice received today, which regions would still be inside the contract's payment "
            "window after 31 days, and what is the combined revenue of those regions? Reason "
            "carefully and explain.",
        )
        show(events, seen)
        has_reasoning = any(n == "reasoning.delta" for n, _ in events)
        print("  reasoning.delta events present:", has_reasoning)
        check(any(n == "message.end" for n, _ in events), "harder question completes")

        print("\n== persisted state")
        msgs = (await c.get(f"/v1/sessions/{sid1}/messages")).json()["messages"]
        check([m["role"] for m in msgs] == ["user", "assistant"], "two messages stored")
        types = [p["type"] for p in msgs[1]["parts"]]
        print("  parts:", types)
        check("tool" in types and "text" in types and "citation" in types, "parts include tool, text, citation")
        sessions = (await c.get("/v1/sessions")).json()["sessions"]
        print("  sessions:", [(s["title"]) for s in sessions])
        check(all(s["title"] for s in sessions), "every session has a title")
        async with get_sessionmaker()() as s:
            usage = (
                await s.execute(
                    text(
                        "SELECT kind, service_tier, sum(input_tokens), sum(output_tokens), "
                        "sum(reasoning_tokens), sum(cost_usd) FROM llm_usage WHERE user_id = :u "
                        "GROUP BY kind, service_tier ORDER BY kind"
                    ),
                    {"u": uid},
                )
            ).all()
            bal = (
                await s.execute(
                    text("SELECT message_balance FROM credit_accounts WHERE user_id = :u"), {"u": uid}
                )
            ).scalar_one()
        print("  llm_usage:", [tuple(r) for r in usage])
        check(bal == 22, f"three chat credits spent (message_balance={bal})")

        for doc_id in ids:
            await c.delete(f"/v1/documents/{doc_id}")
        for sid in (sid1, sid2, sid3):
            await c.delete(f"/v1/sessions/{sid}")

    async with get_sessionmaker()() as s, s.begin():
        for table in ("llm_usage", "credit_transactions", "credit_accounts"):
            await s.execute(text(f"DELETE FROM {table} WHERE user_id = :u"), {"u": uid})
    await dispose_engine()
    print("\ncleaned up throwaway user", uid)
    return failures


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765")) else 0)

"""Hybrid retrieval and the agent tools, against real Postgres (pgvector + full text)."""

import json
import uuid

from app.config import get_settings
from app.db import get_sessionmaker
from app.services import retrieval
from app.services.chunking import chunk_pages
from app.services.parsing import PageText
from app.services.tools import ToolContext, merge_chunks, render_with_page_markers, run_tool
from tests.factories import make_document, one_hot

QUERY_VEC = one_hot(0)


async def search(user_id, text, *, document_ids=None):
    async with get_sessionmaker()() as s:
        return await retrieval.search_chunks(
            s, user_id=user_id, query_text=text, query_vector=QUERY_VEC, document_ids=document_ids
        )


async def test_hybrid_returns_keyword_only_and_semantic_only_matches(infra, user_id, monkeypatch):
    # With one candidate per ranking, each list contributes exactly its single best chunk.
    monkeypatch.setattr(get_settings(), "retrieval_candidates", 1)
    doc = await make_document(
        user_id,
        chunks=[
            # nearest to the query vector, shares no words with the query text
            ("Quarterly figures were stable across regions.", one_hot(0), 1),
            # far from the query vector, but contains the rare query term
            ("The zxqvortex clause governs early termination.", one_hot(7), 2),
            ("Unrelated filler about the weather.", one_hot(9), 3),
        ],
    )
    hits = await search(user_id, "zxqvortex")
    by_text = {h.content.split()[0]: h for h in hits}
    semantic_only = by_text["Quarterly"]
    keyword_only = by_text["The"]
    assert semantic_only.keyword_rank is None and semantic_only.semantic_rank == 1
    assert keyword_only.semantic_rank is None and keyword_only.keyword_rank == 1
    assert {h.document_id for h in hits} == {doc}
    assert keyword_only.page_start == 2 and keyword_only.file_name == "report.pdf"


async def test_chunk_found_by_both_rankings_ranks_first(infra, user_id):
    await make_document(
        user_id,
        chunks=[
            ("Termination needs thirty days notice.", one_hot(0), 1),
            ("Payment terms are net thirty.", one_hot(3), 2),
            ("Notice must be written.", one_hot(4), 3),
        ],
    )
    hits = await search(user_id, "termination notice")
    assert hits[0].content.startswith("Termination")
    assert hits[0].semantic_rank == 1 and hits[0].keyword_rank == 1
    assert hits[0].score > hits[1].score


async def test_retrieval_never_returns_another_users_chunks(infra, user_id):
    other = f"other_{uuid.uuid4().hex[:8]}"
    await make_document(user_id, chunks=[("mine: the secret passphrase is plum", one_hot(0), 1)])
    await make_document(other, chunks=[("theirs: the secret passphrase is cherry", one_hot(0), 1)])
    texts = [h.content for h in await search(user_id, "secret passphrase")]
    assert texts and all(t.startswith("mine") for t in texts)


async def test_retrieval_ignores_documents_that_are_not_ready(infra, user_id):
    await make_document(
        user_id, status="processing", chunks=[("halfway indexed content", one_hot(0), 1)]
    )
    assert await search(user_id, "halfway indexed") == []


async def test_retrieval_can_be_limited_to_selected_documents(infra, user_id):
    a = await make_document(user_id, file_name="a.pdf", chunks=[("alpha shared words", one_hot(0), 1)])
    await make_document(user_id, file_name="b.pdf", chunks=[("beta shared words", one_hot(0), 1)])
    hits = await search(user_id, "shared words", document_ids=[a])
    assert {h.document_id for h in hits} == {a}


# --- tools -------------------------------------------------------------------------------------


def ctx_for(user_id, document_ids=None):
    return ToolContext(user_id=user_id, session_id=uuid.uuid4(), document_ids=document_ids)


async def test_list_documents_shows_ready_documents_and_csv_columns(infra, user_id):
    await make_document(user_id, file_name="notes.pdf", chunks=[("x", None, 1)])
    await make_document(user_id, status="processing", file_name="pending.pdf")
    await make_document(
        user_id, csv_rows=[{"Region": "N", "Amount": "5"}, {"Region": "S", "Amount": "7"}]
    )
    res = await run_tool("list_documents", {}, ctx_for(user_id))
    docs = {d["file_name"]: d for d in json.loads(res.output)["documents"]}
    assert set(docs) == {"notes.pdf", "table.csv"}  # the processing one is hidden
    cols = {c["name"]: c["type"] for c in docs["table.csv"]["columns"]}
    assert cols == {"row_num": "integer", "Region": "text", "Amount": "integer"}
    assert res.summary == "2 documents"


async def test_list_documents_respects_the_chat_selection(infra, user_id):
    a = await make_document(user_id, file_name="a.pdf", chunks=[("x", None, 1)])
    await make_document(user_id, file_name="b.pdf", chunks=[("y", None, 1)])
    res = await run_tool("list_documents", {}, ctx_for(user_id, [a]))
    assert [d["file_name"] for d in json.loads(res.output)["documents"]] == ["a.pdf"]


async def test_search_documents_registers_numbered_sources(infra, user_id, fake_openai):
    await make_document(
        user_id, file_name="contract.pdf", chunks=[("Notice period is thirty days.", None, 4)]
    )
    ctx = ctx_for(user_id)
    res = await run_tool("search_documents", {"query": "notice period"}, ctx)
    assert res.ok and res.output.startswith("[1] contract.pdf, page 4")
    assert ctx.sources[0].file_name == "contract.pdf" and ctx.sources[0].page_start == 4
    assert ctx.embedding_usage.input_tokens > 0  # query embedding is metered
    # The same chunk found again keeps its number.
    await run_tool("search_documents", {"query": "notice period"}, ctx)
    assert len(ctx.sources) == 1


async def test_tools_never_expose_another_users_documents(infra, user_id, fake_openai):
    other = f"other_{uuid.uuid4().hex[:8]}"
    theirs = await make_document(
        other, chunks=[("their private text", None, 1)], status="ready", file_name="theirs.pdf"
    )
    theirs_csv = await make_document(other, csv_rows=[{"a": "1"}])
    ctx = ctx_for(user_id)
    for name, args in [
        ("get_document_text", {"document_id": str(theirs)}),
        ("query_table", {"document_id": str(theirs_csv), "sql": "SELECT * FROM rows"}),
        ("search_documents", {"query": "private", "document_id": str(theirs)}),
    ]:
        res = await run_tool(name, args, ctx)
        assert not res.ok or "their private text" not in res.output, name
        assert "their private text" not in res.output
    listed = json.loads((await run_tool("list_documents", {}, ctx)).output)["documents"]
    assert listed == []
    assert ctx.sources == []


async def test_documents_outside_the_selection_are_off_limits(infra, user_id):
    a = await make_document(user_id, chunks=[("inside", None, 1)])
    b = await make_document(user_id, file_name="b.pdf", chunks=[("outside", None, 1)])
    ctx = ctx_for(user_id, [a])
    assert (await run_tool("get_document_text", {"document_id": str(a)}, ctx)).ok
    res = await run_tool("get_document_text", {"document_id": str(b)}, ctx)
    assert not res.ok and "outside" not in res.output


async def test_get_document_text_rebuilds_text_without_overlap_and_truncates(
    infra, user_id, monkeypatch
):
    paragraphs = [f"Paragraph {i}: " + "lorem ipsum dolor sit amet " * 12 for i in range(40)]
    original = "\n\n".join(paragraphs)
    chunks = chunk_pages([PageText(1, original)])
    assert len(chunks) > 3  # real overlapping chunks
    doc = await make_document(user_id, chunks=[(c.content, None, 1) for c in chunks])
    res = await run_tool("get_document_text", {"document_id": str(doc)}, ctx_for(user_id))
    body = res.output.split("\n\n", 1)[1].removeprefix("[Page 1]\n")
    # Chunks are stored stripped, so edge whitespace is not recoverable; everything else must
    # match exactly: overlap removed, nothing lost, nothing repeated.
    assert " ".join(body.split()) == " ".join(original.split())
    assert body.count("Paragraph 17:") == 1

    monkeypatch.setattr(get_settings(), "doc_text_max_tokens", 100)
    short = await run_tool("get_document_text", {"document_id": str(doc)}, ctx_for(user_id))
    assert "Truncated" in short.output and short.summary.endswith("(truncated)")
    assert len(short.output) < 1000


def test_merge_chunks_handles_no_overlap_and_page_markers():
    text, pages = merge_chunks([("first chunk text", 1), ("second chunk text", 2)])
    assert text == "first chunk text\n\nsecond chunk text"
    assert render_with_page_markers(text, pages) == (
        "[Page 1]\nfirst chunk text\n\n[Page 2]\nsecond chunk text"
    )
    assert render_with_page_markers("csv rows", [(0, None)]) == "csv rows"


async def test_query_table_tool_reports_guard_errors_to_the_model(infra, user_id):
    doc = await make_document(user_id, csv_rows=[{"a": "1"}, {"a": "2"}])
    ctx = ctx_for(user_id)
    ok = await run_tool("query_table", {"document_id": str(doc), "sql": "SELECT SUM(a) FROM rows"}, ctx)
    assert ok.ok and json.loads(ok.output)["rows"] == [[3]]
    assert ctx.sources[0].snippet.startswith("SQL: SELECT SUM(a)")
    bad = await run_tool("query_table", {"document_id": str(doc), "sql": "DROP TABLE rows"}, ctx)
    assert not bad.ok and "SELECT" in json.loads(bad.output)["error"]
    pdf = await make_document(user_id, chunks=[("t", None, 1)])
    notable = await run_tool("query_table", {"document_id": str(pdf), "sql": "SELECT 1"}, ctx)
    assert not notable.ok and "not a table" in notable.output


async def test_unknown_tool_and_bad_arguments_do_not_raise(infra, user_id):
    ctx = ctx_for(user_id)
    assert not (await run_tool("rm_rf", {}, ctx)).ok
    assert not (await run_tool("search_documents", "not json{", ctx)).ok
    assert not (await run_tool("get_document_text", {"document_id": "nope"}, ctx)).ok

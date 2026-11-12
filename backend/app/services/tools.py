"""Agent tools: the four capabilities the n8n agent had, made safe and user-scoped.

| Tool               | Behaviour                                                              |
|--------------------|------------------------------------------------------------------------|
| list_documents     | the user's `ready` documents (respecting the chat's selection) + CSV   |
|                    | columns                                                                |
| search_documents   | hybrid retrieval (`services/retrieval.py`)                             |
| get_document_text  | full text rebuilt from chunks (overlap removed), token-budget truncated|
| query_table        | one guarded SELECT over a CSV (`services/sql_guard.py`)                |

Every tool runs under a `ToolContext` that carries the user id and the chat's document
selection. Tools open their own short database session so no connection is held while the
model streams. A tool never raises to the agent loop: failures come back as an `error` result
the model can read and recover from.

Evidence that can be cited is registered in `ctx.sources` and labelled `[n]` in the tool output;
the model cites those numbers and the chat stream turns them into `citation` events.
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from app.config import get_settings
from app.db import get_sessionmaker
from app.errors import ApiError, ErrorCode
from app.models.documents import Document, DocumentChunk
from app.services import documents as docs
from app.services import retrieval, sql_guard
from app.services.embeddings import embed_query
from app.services.usage import Usage

log = logging.getLogger("docgenie.tools")

MIN_OVERLAP_CHARS = 8  # a shorter suffix/prefix match is a coincidence, not chunk overlap


@dataclass
class Source:
    index: int
    document_id: uuid.UUID
    file_name: str
    page_start: int | None
    page_end: int | None
    snippet: str


@dataclass
class ToolContext:
    user_id: str
    session_id: uuid.UUID
    document_ids: list[uuid.UUID] | None = None  # the chat's selection; None = all documents
    sources: list[Source] = field(default_factory=list)
    embedding_usage: Usage = field(default_factory=Usage)
    _source_keys: dict[tuple[Any, ...], int] = field(default_factory=dict)

    def add_source(
        self,
        key: tuple[Any, ...],
        *,
        document_id: uuid.UUID,
        file_name: str,
        page_start: int | None,
        page_end: int | None,
        snippet: str,
    ) -> int:
        """Register citable evidence and return its 1-based number (stable for equal keys)."""
        existing = self._source_keys.get(key)
        if existing is not None:
            return existing
        index = len(self.sources) + 1
        self.sources.append(Source(index, document_id, file_name, page_start, page_end, snippet))
        self._source_keys[key] = index
        return index


@dataclass
class ToolResult:
    output: str  # sent to the model
    summary: str  # short human-readable line for the UI trace
    ok: bool = True


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "list_documents",
        "description": (
            "List the user's ready documents: document_id, file_name, type, page count and, for "
            "CSV files, the columns query_table can use. Call this first when you need a "
            "document_id or are asked about the documents themselves."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "type": "function",
        "name": "search_documents",
        "description": (
            "Hybrid semantic + keyword search over the user's documents. Returns the most "
            "relevant passages, each labelled with a source number [n] to cite. Use a focused "
            "search query, not the whole question."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to look for."},
                "document_id": {
                    "type": "string",
                    "description": "Optional: restrict the search to this document.",
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "get_document_text",
        "description": (
            "Return the full text of one document (truncated if very long). Use it for "
            "summaries and whole-document questions. Do not combine with search_documents for "
            "the same document."
        ),
        "parameters": {
            "type": "object",
            "properties": {"document_id": {"type": "string"}},
            "required": ["document_id"],
            "additionalProperties": False,
        },
    },
    {
        "type": "function",
        "name": "query_table",
        "description": (
            "Run one SQL SELECT over a CSV document. The table is named `rows` (columns = the "
            "CSV headers plus row_num). Max 100 rows returned; aggregate in SQL."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string"},
                "sql": {"type": "string", "description": "A single SELECT ... FROM rows ..."},
            },
            "required": ["document_id", "sql"],
            "additionalProperties": False,
        },
    },
]


def _clip(text: str) -> str:
    limit = get_settings().tool_result_max_chars
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n[output truncated at {limit} characters]"


def _error(message: str) -> ToolResult:
    return ToolResult(json.dumps({"error": message}), f"Error: {message}", ok=False)


def _parse_document_id(raw: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        return None


async def run_tool(name: str, arguments: str | dict[str, Any], ctx: ToolContext) -> ToolResult:
    """Dispatch one tool call. Never raises."""
    try:
        if isinstance(arguments, str):
            args = json.loads(arguments) if arguments.strip() else {}
        else:
            args = arguments
        if not isinstance(args, dict):
            return _error("Tool arguments must be a JSON object.")
    except json.JSONDecodeError:
        return _error("Tool arguments were not valid JSON.")
    handler = _HANDLERS.get(name)
    if handler is None:
        return _error(f"Unknown tool `{name}`.")
    try:
        result = await handler(ctx, args)
    except ApiError as exc:
        return _error(exc.message)
    except sql_guard.SqlGuardError as exc:
        return _error(str(exc))
    except Exception:
        log.exception("tool %s failed", name)
        return _error("The tool failed unexpectedly.")
    return ToolResult(_clip(result.output), result.summary, result.ok)


def _in_selection(ctx: ToolContext, document_id: uuid.UUID) -> bool:
    return not ctx.document_ids or document_id in ctx.document_ids


async def _owned_ready_document(ctx: ToolContext, raw_id: Any) -> Document:
    """The document if it is the user's, ready and inside the chat's selection."""
    document_id = _parse_document_id(raw_id)
    if document_id is None:
        raise ApiError(ErrorCode.NOT_FOUND, "document_id must be an id from list_documents.")
    async with get_sessionmaker()() as session:
        doc = await docs.get_owned_document(session, ctx.user_id, document_id)
    if not _in_selection(ctx, document_id):
        raise ApiError(ErrorCode.NOT_FOUND, "Document not found.")
    if doc.status != "ready":
        raise ApiError(ErrorCode.NOT_FOUND, f"`{doc.file_name}` is not ready yet (status: {doc.status}).")
    return doc


# --- list_documents ---------------------------------------------------------------------------


async def _list_documents(ctx: ToolContext, _: dict[str, Any]) -> ToolResult:
    async with get_sessionmaker()() as session:
        stmt = select(Document).where(Document.user_id == ctx.user_id, Document.status == "ready")
        if ctx.document_ids:
            stmt = stmt.where(Document.id.in_(ctx.document_ids))
        rows = (await session.execute(stmt.order_by(Document.created_at.desc()))).scalars().all()
    items: list[dict[str, Any]] = []
    for d in rows:
        item: dict[str, Any] = {
            "document_id": str(d.id),
            "file_name": d.file_name,
            "mime_type": d.mime_type,
            "pages": d.num_pages,
        }
        if d.csv_schema:
            item["is_table"] = True
            item["row_count"] = d.csv_schema.get("row_count")
            item["columns"] = [
                {"name": c.name, "type": c.type, "example_values": _samples(d.csv_schema, c.key)}
                for c in sql_guard.rows_columns(d.csv_schema)
            ]
        items.append(item)
    summary = f"{len(items)} document{'s' if len(items) != 1 else ''}"
    return ToolResult(json.dumps({"documents": items}, ensure_ascii=False), summary)


def _samples(schema: dict[str, Any], key: str | None) -> list[str]:
    if key is None:
        return []
    for col in schema.get("columns", []):
        if col.get("name") == key:
            return list(col.get("sample", []))
    return []


# --- search_documents -------------------------------------------------------------------------


async def _search_documents(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    query = str(args.get("query", "")).strip()
    if not query:
        return _error("`query` is required.")
    scope = ctx.document_ids
    if args.get("document_id"):
        document_id = _parse_document_id(args["document_id"])
        if document_id is None or not _in_selection(ctx, document_id):
            return _error("document_id must be an id from list_documents.")
        scope = [document_id]
    vector, usage = await embed_query(query)
    ctx.embedding_usage.add(usage)
    async with get_sessionmaker()() as session:
        hits = await retrieval.search_chunks(
            session,
            user_id=ctx.user_id,
            query_text=query,
            query_vector=vector,
            document_ids=scope,
        )
    if not hits:
        return ToolResult(
            json.dumps({"results": [], "note": "No relevant passages found."}),
            "No matching passages",
        )
    blocks: list[str] = []
    for hit in hits:
        index = ctx.add_source(
            ("chunk", hit.chunk_id),
            document_id=hit.document_id,
            file_name=hit.file_name,
            page_start=hit.page_start,
            page_end=hit.page_end,
            snippet=hit.snippet,
        )
        blocks.append(
            f"[{index}] {hit.file_name}{_pages_label(hit.page_start, hit.page_end)}"
            f" (document_id: {hit.document_id})\n{hit.content}"
        )
    n_docs = len({h.document_id for h in hits})
    summary = f"{len(hits)} passages from {n_docs} document{'s' if n_docs != 1 else ''}"
    return ToolResult("\n\n---\n\n".join(blocks), summary)


def _pages_label(start: int | None, end: int | None) -> str:
    if start is None:
        return ""
    return f", page {start}" if end in (None, start) else f", pages {start}-{end}"


# --- get_document_text ------------------------------------------------------------------------


def merge_chunks(
    chunks: list[tuple[str, int | None]],
) -> tuple[str, list[tuple[int, int | None]]]:
    """Rebuild text from consecutive overlapping chunks, dropping the duplicated overlap.

    Returns the text and the (offset, page) pairs where the starting page changes, so the caller
    can render page markers without them getting in the way of overlap matching.
    """
    out = ""
    pages: list[tuple[int, int | None]] = []
    window = get_settings().chunk_overlap + 50
    for content, page in chunks:
        gap = ""
        novel = content
        if out:
            tail = out[-window:]
            cut = 0
            for k in range(min(len(tail), len(content)), MIN_OVERLAP_CHARS - 1, -1):
                if tail.endswith(content[:k]):
                    cut = k
                    break
            if cut:
                novel = content[cut:]
            else:
                gap = "\n\n"  # no overlap found: keep the chunks apart
        if not pages or pages[-1][1] != page:
            pages.append((len(out) + len(gap), page))
        out += gap + novel
    return out, pages


def render_with_page_markers(text: str, pages: list[tuple[int, int | None]]) -> str:
    """Insert `[Page N]` lines at the recorded offsets (page-less documents get none)."""
    if all(page is None for _, page in pages):
        return text
    ends = [offset for offset, _ in pages[1:]] + [len(text)]
    sections: list[str] = []
    for (offset, page), end in zip(pages, ends, strict=True):
        body = text[offset:end].strip()
        sections.append(f"[Page {page}]\n{body}" if page is not None else body)
    return "\n\n".join(sections)


async def _get_document_text(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    doc = await _owned_ready_document(ctx, args.get("document_id"))
    async with get_sessionmaker()() as session:
        rows = (
            await session.execute(
                select(DocumentChunk.content, DocumentChunk.page_start)
                .where(DocumentChunk.document_id == doc.id, DocumentChunk.user_id == ctx.user_id)
                .order_by(DocumentChunk.chunk_index)
            )
        ).all()
    if not rows:
        return _error("This document has no text.")

    text, pages = merge_chunks([(content, page) for content, page in rows])
    full = render_with_page_markers(text, pages)
    budget = get_settings().doc_text_max_tokens * 4  # about 4 characters per token
    truncated = len(full) > budget
    shown = full[:budget]
    index = ctx.add_source(
        ("full", doc.id),
        document_id=doc.id,
        file_name=doc.file_name,
        page_start=1 if doc.num_pages else None,
        page_end=doc.num_pages,
        snippet=retrieval.make_snippet(shown),
    )
    header = f"[{index}] Full text of {doc.file_name} (document_id: {doc.id})"
    if truncated:
        header += f"\n[Truncated: showing the first {len(shown)} of {len(full)} characters]"
    summary = f"{doc.file_name}: {len(shown):,} characters" + (" (truncated)" if truncated else "")
    return ToolResult(f"{header}\n\n{shown}", summary)


# --- query_table ------------------------------------------------------------------------------


async def _query_table(ctx: ToolContext, args: dict[str, Any]) -> ToolResult:
    doc = await _owned_ready_document(ctx, args.get("document_id"))
    if not doc.csv_schema:
        return _error(f"`{doc.file_name}` is not a table. Use search_documents instead.")
    sql = str(args.get("sql", ""))
    result = await sql_guard.run_query(
        user_id=ctx.user_id, document_id=doc.id, csv_schema=doc.csv_schema, sql=sql
    )
    index = ctx.add_source(
        ("sql", doc.id, " ".join(sql.split())),
        document_id=doc.id,
        file_name=doc.file_name,
        page_start=None,
        page_end=None,
        snippet=retrieval.make_snippet(f"SQL: {' '.join(sql.split())}"),
    )
    payload: dict[str, Any] = {
        "source": f"[{index}]",
        "columns": result.columns,
        "rows": result.rows,
        "row_count": result.row_count,
    }
    if result.truncated:
        payload["note"] = (
            f"Only the first {result.row_count} rows are shown. Aggregate or filter in SQL."
        )
    summary = f"{result.row_count} row{'s' if result.row_count != 1 else ''}" + (
        "+" if result.truncated else ""
    )
    return ToolResult(json.dumps(payload, ensure_ascii=False, default=str), summary)


_HANDLERS = {
    "list_documents": _list_documents,
    "search_documents": _search_documents,
    "get_document_text": _get_document_text,
    "query_table": _query_table,
}


def timed_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)

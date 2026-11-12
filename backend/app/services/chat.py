"""Chat turn orchestration: reserve credit + persist the user message (`prepare_turn`), then stream
the agent run as SSE and persist the assistant message (`stream_turn`).

Lifecycle of one turn
1. `prepare_turn` (before any bytes are streamed, so errors are real HTTP errors):
   one transaction upserts the session, loads the history window, reserves 1 message credit
   (402 if the balance is empty) and stores the user message.
2. `stream_turn` yields SSE frames while the agent runs. When it ends, the assistant message
   (`parts`, `metrics`, status) and the `llm_usage` rows are written in one transaction.
   - no answer text produced (error, empty answer, or disconnect before any text) -> the credit
     is refunded;
   - failure after some text -> status `incomplete`, no refund;
   - client disconnect -> the run is cancelled (the model stream is closed) and the partial
     message is saved as `incomplete` by a detached task that survives the cancellation.
3. After `message.end`, the first completed turn of a session gets a server-generated title
   (`session.title` event).

See backend/docs/chat-stream.md for the wire contract.
"""

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_sessionmaker
from app.errors import ApiError, ErrorCode
from app.models.chat import ChatMessage, ChatSession
from app.models.documents import Document
from app.prompts import TITLE_PROMPT
from app.schemas.chat import ChatRequest
from app.services import credits, llm
from app.services.agent import (
    Accumulator,
    AgentStats,
    ReasoningDelta,
    TextDelta,
    ToolEnd,
    ToolStart,
    run_agent,
)
from app.services.citations import CITATION_RE, cited_numbers, claim_text, focus_source
from app.services.tools import ToolContext
from app.services.usage import Usage, log_usage, usage_from_response

log = logging.getLogger("docgenie.chat")

HISTORY_STATUSES = ("complete", "incomplete", "stopped")


@dataclass
class Turn:
    user_id: str
    session_id: uuid.UUID
    user_message_id: uuid.UUID
    assistant_message_id: uuid.UUID
    user_text: str
    document_ids: list[uuid.UUID] | None  # effective selection for this turn
    history: list[dict[str, Any]]  # prior messages as Responses API input items
    needs_title: bool
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def cited_indices(text: str) -> list[int]:
    """Source numbers the answer cites ([1], [2][3], [1, 2]), ascending and unique."""
    found: set[int] = set()
    for group in CITATION_RE.findall(text):
        found.update(cited_numbers(group))
    return sorted(found)


def strip_citations(text: str) -> str:
    """Remove `[n]` markers. Citation numbers restart every turn, so replayed history must not
    carry the old ones (they would collide with the new turn's numbering)."""
    cleaned = CITATION_RE.sub("", text)
    return re.sub(r"[ \t]+([.,;:!?])", r"\1", re.sub(r"[ \t]{2,}", " ", cleaned)).strip()


# --- prepare ----------------------------------------------------------------------------------


async def assert_documents_owned(
    session: AsyncSession, user_id: str, document_ids: list[uuid.UUID]
) -> None:
    unique = set(document_ids)
    count = (
        await session.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.user_id == user_id, Document.id.in_(unique))
        )
    ).scalar_one()
    if count != len(unique):
        raise ApiError(ErrorCode.NOT_FOUND, "Document not found.")


async def prepare_turn(session: AsyncSession, user_id: str, req: ChatRequest) -> Turn:
    """Upsert the session, reserve the credit and store the user message, atomically."""
    s = get_settings()
    selection_given = "document_ids" in req.model_fields_set
    selection = list(dict.fromkeys(req.document_ids)) if req.document_ids else None
    user_message_id = uuid.uuid4()
    assistant_message_id = uuid.uuid4()

    async with session.begin():
        if selection:
            await assert_documents_owned(session, user_id, selection)
        await session.execute(
            pg_insert(ChatSession)
            .values(id=req.session_id, user_id=user_id, document_ids=selection)
            .on_conflict_do_nothing(index_elements=[ChatSession.id])
        )
        chat = (
            await session.execute(select(ChatSession).where(ChatSession.id == req.session_id))
        ).scalar_one()
        if chat.user_id != user_id:  # someone else's id: indistinguishable from a missing one
            raise ApiError(ErrorCode.NOT_FOUND, "Chat session not found.")
        effective = chat.document_ids
        if selection_given and (chat.document_ids or None) != selection:
            await session.execute(
                update(ChatSession).where(ChatSession.id == chat.id).values(document_ids=selection)
            )
            effective = selection

        recent = (
            await session.execute(
                select(ChatMessage.role, ChatMessage.content)
                .where(
                    ChatMessage.session_id == chat.id,
                    ChatMessage.user_id == user_id,
                    ChatMessage.status.in_(HISTORY_STATUSES),
                    ChatMessage.content != "",
                )
                .order_by(ChatMessage.created_at.desc(), ChatMessage.id)
                .limit(s.history_window)
            )
        ).all()
        history = [
            {
                "role": role,
                "content": strip_citations(content) if role == "assistant" else content,
            }
            for role, content in reversed(recent)
        ]

        await credits.reserve(
            session,
            user_id,
            "message",
            reference_id=assistant_message_id,
            description="Chat message",
        )
        session.add(
            ChatMessage(
                id=user_message_id,
                session_id=chat.id,
                user_id=user_id,
                role="user",
                content=req.message,
                status="complete",
            )
        )
        await session.execute(
            update(ChatSession).where(ChatSession.id == chat.id).values(updated_at=func.now())
        )
        needs_title = chat.title is None

    return Turn(
        user_id=user_id,
        session_id=req.session_id,
        user_message_id=user_message_id,
        assistant_message_id=assistant_message_id,
        user_text=req.message,
        document_ids=list(effective) if effective else None,
        history=history,
        needs_title=needs_title,
    )


# --- stream -----------------------------------------------------------------------------------

_background: set[asyncio.Task[Any]] = set()


def _detach(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    """Run `coro` as its own task so a cancelled request cannot abort it half way."""
    task = asyncio.ensure_future(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)
    return task


async def drain_background() -> None:
    """Wait for detached persistence tasks (tests, graceful shutdown)."""
    while _background:
        await asyncio.gather(*list(_background), return_exceptions=True)


@dataclass
class Run:
    turn: Turn
    ctx: ToolContext
    acc: Accumulator = field(default_factory=Accumulator)
    stats: AgentStats = field(default_factory=AgentStats)
    started: float = field(default_factory=time.perf_counter)
    first_text_at: float | None = None

    def metrics(self) -> dict[str, Any]:
        s = get_settings()
        out = self.stats.usage.output_tokens
        gen = self.stats.llm_seconds
        return {
            "ttft_ms": None
            if self.first_text_at is None
            else int((self.first_text_at - self.started) * 1000),
            "total_ms": int((time.perf_counter() - self.started) * 1000),
            "output_tokens": out,
            "input_tokens": self.stats.usage.input_tokens,
            "reasoning_tokens": self.stats.usage.reasoning_tokens,
            "tokens_per_s": round(out / gen, 1) if gen > 0 and out else None,
            "steps": self.stats.steps,
            "tool_calls": self.stats.tool_calls,
            "model": s.chat_model,
            "service_tier": self.stats.service_tier or s.chat_service_tier,
            "flex_fallback": self.stats.flex_fallback,
        }

    def citations(self) -> list[dict[str, Any]]:
        """The cited sources, each narrowed to the passage its `[n]` sentences rely on."""
        answer = self.acc.content
        wanted = set(cited_indices(answer))
        out: list[dict[str, Any]] = []
        for src in self.ctx.sources:
            if src.index not in wanted:
                continue
            snippet, page_start, page_end = src.snippet, src.page_start, src.page_end
            focus = None
            if src.text:
                try:
                    focus = focus_source(
                        src.text,
                        claim_text(answer, src.index),
                        paged=src.paged,
                        max_chars=get_settings().citation_focus_chars,
                    )
                except Exception:  # never lose a citation over the highlight
                    log.exception("could not focus citation %s", src.index)
            if focus is not None:
                snippet = focus.snippet
                if focus.page_start is not None:
                    page_start = focus.page_start
                    last = page_end if page_end is not None else focus.page_start
                    page_end = min(focus.page_end or focus.page_start + 1, last)
                    page_end = max(page_end, page_start)
            out.append(
                {
                    "index": src.index,
                    "document_id": str(src.document_id),
                    "file_name": src.file_name,
                    "page_start": page_start,
                    "page_end": page_end,
                    "snippet": snippet,
                }
            )
        return out


async def _persist(
    run: Run,
    *,
    status: str,
    error: tuple[str, str] | None,
    citations: list[dict[str, Any]],
    metrics: dict[str, Any],
) -> None:
    """Write the assistant message, usage rows and (when no answer was produced) the refund."""
    s = get_settings()
    turn = run.turn
    content = run.acc.content
    parts = list(run.acc.parts)
    parts.extend({"type": "citation", **c} for c in citations)
    if error is not None:
        parts.append({"type": "error", "code": error[0], "message": error[1]})
    # A tool that was still running when the run ended must not be stored as "running".
    for part in parts:
        if part["type"] == "tool" and part.get("status") == "running":
            part["status"] = "error"
    try:
        async with get_sessionmaker()() as session, session.begin():
            session.add(
                ChatMessage(
                    id=turn.assistant_message_id,
                    session_id=turn.session_id,
                    user_id=turn.user_id,
                    role="assistant",
                    content=content,
                    parts=parts,
                    metrics=metrics,
                    model=s.chat_model,
                    status=status,
                )
            )
            await session.execute(
                update(ChatSession)
                .where(ChatSession.id == turn.session_id)
                .values(updated_at=func.now())
            )
            await _log_run_usage(session, run)
            if not content.strip():
                await credits.refund(
                    session,
                    turn.user_id,
                    "message",
                    reference_id=turn.assistant_message_id,
                    description="Refund: no answer was produced",
                )
    except Exception:
        # Most likely the session was deleted while the answer streamed (FK violation).
        log.exception("could not store assistant message %s", turn.assistant_message_id)
        if not content.strip():
            await _refund_only(turn)


async def _refund_only(turn: Turn) -> None:
    try:
        async with get_sessionmaker()() as session, session.begin():
            await credits.refund(
                session,
                turn.user_id,
                "message",
                reference_id=turn.assistant_message_id,
                description="Refund: no answer was produced",
            )
    except Exception:
        log.exception("refund failed for message %s", turn.assistant_message_id)


async def _log_run_usage(session: AsyncSession, run: Run) -> None:
    s = get_settings()
    usage = run.stats.usage
    if usage.input_tokens or usage.output_tokens:
        await log_usage(
            session,
            user_id=run.turn.user_id,
            kind="chat",
            model=s.chat_model,
            usage=usage,
            service_tier=run.stats.service_tier or s.chat_service_tier,
            session_id=run.turn.session_id,
        )
    if run.ctx.embedding_usage.input_tokens:
        await log_usage(
            session,
            user_id=run.turn.user_id,
            kind="embedding",
            model=s.embedding_model,
            usage=run.ctx.embedding_usage,
            service_tier="default",
            session_id=run.turn.session_id,
        )


def _usage_payload(usage: Usage) -> dict[str, int]:
    return {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "reasoning_tokens": usage.reasoning_tokens,
        "cached_tokens": usage.cached_tokens,
    }


async def stream_turn(turn: Turn) -> AsyncIterator[str]:
    """Yield the SSE frames for one turn. Always ends with `message.end` unless the client left."""
    run = Run(
        turn=turn,
        ctx=ToolContext(
            user_id=turn.user_id, session_id=turn.session_id, document_ids=turn.document_ids
        ),
    )
    error: tuple[str, str] | None = None
    try:
        yield sse(
            "message.start",
            {
                "session_id": str(turn.session_id),
                "user_message_id": str(turn.user_message_id),
                "message_id": str(turn.assistant_message_id),
                "created_at": turn.created_at.isoformat(),
            },
        )
        async for event in run_agent(
            ctx=run.ctx, history=turn.history, user_text=turn.user_text, stats=run.stats
        ):
            if isinstance(event, ReasoningDelta):
                run.acc.reasoning(event.text)
                yield sse("reasoning.delta", {"text": event.text})
            elif isinstance(event, ToolStart):
                run.acc.tool_start(event)
                yield sse(
                    "tool.start", {"id": event.call_id, "name": event.name, "args": event.args}
                )
            elif isinstance(event, ToolEnd):
                run.acc.tool_end(event)
                yield sse(
                    "tool.end",
                    {
                        "id": event.call_id,
                        "name": event.name,
                        "ok": event.ok,
                        "summary": event.summary,
                        "duration_ms": event.duration_ms,
                    },
                )
            elif isinstance(event, TextDelta):
                if run.first_text_at is None:
                    run.first_text_at = time.perf_counter()
                run.acc.text(event.text)
                yield sse("text.delta", {"text": event.text})
        if not run.acc.content.strip():
            error = ("LLM_ERROR", "The model returned no answer. Please try again.")
    except (asyncio.CancelledError, GeneratorExit):
        # The client went away: stop the model run and keep what we have.
        await asyncio.shield(
            _detach(
                _persist(
                    run,
                    status="incomplete",
                    error=None,
                    citations=run.citations(),
                    metrics=run.metrics(),
                )
            )
        )
        raise
    except llm.LlmError as exc:
        error = (exc.code, str(exc))
    except Exception:
        log.exception("chat run failed for session %s", turn.session_id)
        error = (ErrorCode.INTERNAL_ERROR.value, "Something went wrong. Please try again.")

    has_text = bool(run.acc.content.strip())
    status = "complete" if error is None else ("incomplete" if has_text else "error")
    citations = run.citations() if has_text else []
    for citation in citations:
        yield sse("citation", citation)
    if error is not None:
        yield sse("error", {"code": error[0], "message": error[1]})

    metrics = run.metrics()  # computed once: the stored copy and message.end must agree
    await asyncio.shield(
        _detach(_persist(run, status=status, error=error, citations=citations, metrics=metrics))
    )
    yield sse(
        "message.end",
        {
            "message_id": str(turn.assistant_message_id),
            "status": status,
            "usage": _usage_payload(run.stats.usage),
            "metrics": metrics,
        },
    )

    if status == "complete" and turn.needs_title:
        title = await generate_title(turn, run.acc.content)
        if title:
            yield sse("session.title", {"session_id": str(turn.session_id), "title": title})


# --- titles -----------------------------------------------------------------------------------


def fallback_title(text: str) -> str:
    limit = get_settings().title_max_chars
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


def clean_title(raw: str) -> str:
    limit = get_settings().title_max_chars
    title = " ".join(raw.strip().strip("\"'`“”‘’").split()).rstrip(".:;,")
    return title if len(title) <= limit else title[: limit - 1].rstrip() + "…"


async def generate_title(turn: Turn, answer: str) -> str | None:
    """Name the session after its first turn (server-side, so there is no client race with the
    session row). Falls back to the start of the user's message if the model call fails.
    Stored only if the session still has no title."""
    s = get_settings()
    usage = Usage()
    title = ""
    try:
        prompt = (
            TITLE_PROMPT.format(max_chars=s.title_max_chars)
            + f"\n\nUser message:\n{turn.user_text[:1000]}"
            + f"\n\nAssistant reply (start):\n{answer[:500]}"
        )
        raw, resp = await llm.generate_text(prompt, model=s.title_model)
        usage = usage_from_response(resp)
        title = clean_title(raw)
    except Exception:
        log.warning("title generation failed for session %s", turn.session_id, exc_info=True)
    title = title or fallback_title(turn.user_text)
    if not title:
        return None
    try:
        async with get_sessionmaker()() as session, session.begin():
            updated = (
                await session.execute(
                    update(ChatSession)
                    .where(
                        ChatSession.id == turn.session_id,
                        ChatSession.user_id == turn.user_id,
                        ChatSession.title.is_(None),
                    )
                    .values(title=title)
                    .returning(ChatSession.id)
                )
            ).first()
            if updated is None:
                return None
            if usage.input_tokens or usage.output_tokens:
                await log_usage(
                    session,
                    user_id=turn.user_id,
                    kind="title",
                    model=s.title_model,
                    usage=usage,
                    service_tier="default",
                    session_id=turn.session_id,
                )
    except Exception:
        log.exception("could not store title for session %s", turn.session_id)
        return None
    return title

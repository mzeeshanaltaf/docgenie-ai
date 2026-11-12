import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.errors import ApiError, ErrorCode
from app.models.chat import ChatMessage, ChatSession, MessageFeedback
from app.schemas.chat import (
    FeedbackOut,
    MessageListOut,
    MessageOut,
    SessionListOut,
    SessionOut,
    SessionPatch,
)
from app.services.chat import assert_documents_owned

router = APIRouter(prefix="/sessions", tags=["sessions"])


async def _owned_session(session: AsyncSession, user_id: str, session_id: uuid.UUID) -> ChatSession:
    chat = (
        await session.execute(
            select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
        )
    ).scalar_one_or_none()
    if chat is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Chat session not found.")
    return chat


@router.get("", response_model=SessionListOut)
async def list_sessions(
    user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> SessionListOut:
    """The caller's chats, most recently active first."""
    rows = (
        await session.execute(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
        )
    ).scalars()
    return SessionListOut(sessions=[SessionOut.model_validate(r) for r in rows])


@router.get("/{session_id}/messages", response_model=MessageListOut)
async def list_messages(
    session_id: uuid.UUID, user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> MessageListOut:
    """Every message of a chat, oldest first, with `parts`, `metrics` and the caller's feedback."""
    await _owned_session(session, user_id, session_id)
    rows = (
        await session.execute(
            select(ChatMessage, MessageFeedback)
            .outerjoin(MessageFeedback, MessageFeedback.message_id == ChatMessage.id)
            .where(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id)
            .order_by(ChatMessage.created_at, ChatMessage.id)
        )
    ).all()
    messages = [
        MessageOut(
            id=m.id,
            role=m.role,  # type: ignore[arg-type]
            content=m.content,
            parts=m.parts if isinstance(m.parts, list) else None,
            metrics=m.metrics,
            status=m.status,
            model=m.model,
            created_at=m.created_at,
            feedback=FeedbackOut.model_validate(f) if f is not None else None,
        )
        for m, f in rows
    ]
    return MessageListOut(messages=messages)


@router.patch("/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: uuid.UUID,
    body: SessionPatch,
    user_id: CurrentUserId,
    session: AsyncSession = Depends(get_session),
) -> SessionOut:
    """Rename a chat and/or set which documents it searches. Only the fields sent change;
    `document_ids: null` or `[]` goes back to "all documents"."""
    chat = await _owned_session(session, user_id, session_id)
    values: dict[str, object] = {}
    if "title" in body.model_fields_set and body.title is not None:
        values["title"] = body.title
    if "document_ids" in body.model_fields_set:
        selection = list(dict.fromkeys(body.document_ids)) if body.document_ids else None
        if selection:
            await assert_documents_owned(session, user_id, selection)
        values["document_ids"] = selection
    if values:
        await session.execute(
            update(ChatSession)
            .where(ChatSession.id == chat.id, ChatSession.user_id == user_id)
            .values(**values)
        )
        await session.commit()
        await session.refresh(chat)
    return SessionOut.model_validate(chat)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID, user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> Response:
    """Delete a chat; its messages and their feedback go by FK cascade."""
    await _owned_session(session, user_id, session_id)
    await session.execute(
        delete(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user_id)
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

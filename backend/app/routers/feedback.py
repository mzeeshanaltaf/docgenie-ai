import re
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.db import get_session
from app.deps import CurrentUserId
from app.errors import ApiError, ErrorCode
from app.models.chat import ChatMessage, ChatSession, MessageFeedback
from app.schemas.chat import FeedbackIn, FeedbackOut, LikedMessageListOut, LikedMessageOut

router = APIRouter(prefix="/messages", tags=["feedback"])

LIKED_ANSWER_PREVIEW_CHARS = 400


def _preview(text: str, limit: int = LIKED_ANSWER_PREVIEW_CHARS) -> str:
    """One line of plain text: citation marks, emphasis and heading/list markers removed."""
    text = re.sub(r"\s*\[\d+\]", "", text)
    text = re.sub(r"(\*\*|__|`)", "", text)
    text = re.sub(r"(?m)^\s*(#+|[-*+]|\d+\.)\s+", "", text)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


@router.get("/liked", response_model=LikedMessageListOut)
async def list_liked(
    user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> LikedMessageListOut:
    """The caller's liked answers, newest first, each with its question and chat."""
    question_msg = aliased(ChatMessage)
    # The question is the latest user message of the same chat stored before the answer
    # (the user message is committed before the run starts, so it is strictly earlier).
    question = (
        select(question_msg.content)
        .where(
            question_msg.session_id == ChatMessage.session_id,
            question_msg.user_id == user_id,
            question_msg.role == "user",
            question_msg.created_at < ChatMessage.created_at,
        )
        .order_by(question_msg.created_at.desc(), question_msg.id.desc())
        .limit(1)
        .correlate(ChatMessage)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(ChatMessage, ChatSession.title, question)
            .join(MessageFeedback, MessageFeedback.message_id == ChatMessage.id)
            .join(ChatSession, ChatSession.id == ChatMessage.session_id)
            .where(
                MessageFeedback.user_id == user_id,
                MessageFeedback.rating == "like",
                ChatMessage.user_id == user_id,
                ChatSession.user_id == user_id,
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id)
        )
    ).all()
    return LikedMessageListOut(
        messages=[
            LikedMessageOut(
                message_id=m.id,
                session_id=m.session_id,
                session_title=title,
                question=q,
                answer=_preview(m.content),
                created_at=m.created_at,
            )
            for m, title, q in rows
        ]
    )


async def _owned_assistant_message(
    session: AsyncSession, user_id: str, message_id: uuid.UUID
) -> ChatMessage:
    message = (
        await session.execute(
            select(ChatMessage).where(ChatMessage.id == message_id, ChatMessage.user_id == user_id)
        )
    ).scalar_one_or_none()
    if message is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Message not found.")
    if message.role != "assistant":
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Feedback can only be left on assistant messages.")
    return message


@router.put("/{message_id}/feedback", response_model=FeedbackOut)
async def put_feedback(
    message_id: uuid.UUID,
    body: FeedbackIn,
    user_id: CurrentUserId,
    session: AsyncSession = Depends(get_session),
) -> FeedbackOut:
    """Like or dislike an answer (with an optional reason and comment). Replaces earlier feedback.
    Copying is client-side only and is not recorded."""
    await _owned_assistant_message(session, user_id, message_id)
    values = {
        "message_id": message_id,
        "user_id": user_id,
        "rating": body.rating,
        "reason": body.reason,
        "comment": body.comment,
    }
    await session.execute(
        pg_insert(MessageFeedback)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[MessageFeedback.message_id],
            set_={k: v for k, v in values.items() if k not in ("message_id", "user_id")},
        )
    )
    await session.commit()
    return FeedbackOut(message_id=message_id, **body.model_dump())


@router.delete("/{message_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feedback(
    message_id: uuid.UUID, user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> Response:
    """Clear feedback. Idempotent: clearing feedback that is not there still returns 204."""
    await _owned_assistant_message(session, user_id, message_id)
    await session.execute(
        delete(MessageFeedback).where(
            MessageFeedback.message_id == message_id, MessageFeedback.user_id == user_id
        )
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

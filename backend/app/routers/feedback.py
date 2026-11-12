import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.errors import ApiError, ErrorCode
from app.models.chat import ChatMessage, MessageFeedback
from app.schemas.chat import FeedbackIn, FeedbackOut

router = APIRouter(prefix="/messages", tags=["feedback"])


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

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.schemas.chat import ChatRequest
from app.services import chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(
    body: ChatRequest, user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> StreamingResponse:
    """Run one chat turn and stream it as Server-Sent Events.

    Everything that can fail before streaming is a normal HTTP error: 402 `INSUFFICIENT_CREDITS`
    (nothing is stored, nothing is charged), 404 for another user's session or documents, 422 for a
    bad body. After that the response is `200 text/event-stream`; failures inside the run arrive
    as an `error` event followed by `message.end`. Event contract: backend/docs/chat-stream.md.
    """
    turn = await chat.prepare_turn(session, user_id, body)
    await session.close()  # don't hold a pooled connection for the length of the stream
    return StreamingResponse(
        chat.stream_turn(turn),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # ask reverse proxies not to buffer the stream
        },
    )

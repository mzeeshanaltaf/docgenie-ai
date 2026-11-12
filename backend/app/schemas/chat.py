import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_MESSAGE_CHARS = 8000


class ChatRequest(BaseModel):
    """Body of POST /v1/chat/stream."""

    session_id: uuid.UUID  # client-generated (crypto.randomUUID()); the session is created on first use
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    # Omitted: keep the session's selection (new sessions: all documents).
    # A list sets it ([] or null clears it back to "all documents").
    document_ids: list[uuid.UUID] | None = None

    @field_validator("message")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str | None
    document_ids: list[uuid.UUID] | None
    created_at: datetime
    updated_at: datetime


class SessionListOut(BaseModel):
    sessions: list[SessionOut]


class SessionPatch(BaseModel):
    """PATCH /v1/sessions/{id}. Send only what changes; `document_ids: null` or `[]` clears the
    selection (chat over all documents)."""

    title: str | None = Field(default=None, min_length=1, max_length=120)
    document_ids: list[uuid.UUID] | None = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value


class FeedbackIn(BaseModel):
    rating: Literal["like", "dislike"]
    reason: str | None = Field(default=None, max_length=200)
    comment: str | None = Field(default=None, max_length=2000)


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    message_id: uuid.UUID | None = None
    rating: Literal["like", "dislike"]
    reason: str | None = None
    comment: str | None = None


class MessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    # Ordered list of {type: reasoning|tool|text|citation|error, ...}; see backend/docs/chat-stream.md
    parts: list[dict[str, Any]] | None
    metrics: dict[str, Any] | None
    status: str  # complete | incomplete | error | stopped
    model: str | None
    created_at: datetime
    feedback: FeedbackOut | None = None


class MessageListOut(BaseModel):
    messages: list[MessageOut]

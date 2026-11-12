import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    __table_args__ = (Index("ix_chat_sessions_user_updated", "user_id", "updated_at"),)

    # Client-generated (crypto.randomUUID()), so no server default.
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    # NULL = chat over all of the user's documents.
    document_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint("role in ('user','assistant')", name="ck_chat_messages_role"),
        CheckConstraint(
            "status in ('streaming','complete','error','stopped','incomplete')",
            name="ck_chat_messages_status",
        ),
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
        Index("ix_chat_messages_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # reasoning summaries, tool calls, citations
    parts: Mapped[list[Any] | dict[str, Any] | None] = mapped_column(JSONB)
    # ttft_ms, total_ms, output_tokens, tokens_per_s
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    model: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="complete")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    __table_args__ = (
        CheckConstraint("rating in ('like','dislike')", name="ck_message_feedback_rating"),
    )

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)

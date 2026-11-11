import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    Numeric,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CreditAccount(Base):
    __tablename__ = "credit_accounts"
    __table_args__ = (
        # Backstop for races: a balance can never go negative.
        CheckConstraint("credit_balance >= 0", name="ck_credit_accounts_credit_nonneg"),
        CheckConstraint("message_balance >= 0", name="ck_credit_accounts_message_nonneg"),
    )

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    credit_balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    message_balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    __table_args__ = (Index("ix_credit_transactions_user_created", "user_id", "created_at"),)

    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    unit_type: Mapped[str] = mapped_column(Text, nullable=False)  # 'document' | 'message'
    transaction_type: Mapped[str] = mapped_column(Text, nullable=False)  # 'signup'|'usage'|'refund'...
    amount_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    file_name_snapshot: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class LlmUsage(Base):
    __tablename__ = "llm_usage"
    __table_args__ = (
        CheckConstraint("kind in ('chat','title','ocr','embedding')", name="ck_llm_usage_kind"),
        Index("ix_llm_usage_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(Text, nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    service_tier: Mapped[str | None] = mapped_column(Text)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reasoning_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cached_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))  # null = no PRICING entry
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ContactSubmission(Base):
    __tablename__ = "contact_submissions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    ip: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

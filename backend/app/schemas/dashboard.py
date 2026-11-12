"""Response shape of `GET /v1/dashboard` (the contract Phase 5 / 8 build against).

Small by design: counts, balances and a few recent rows. No file bytes, no message bodies.
"""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.documents import DocumentStatus


class BalancesOut(BaseModel):
    documents: int  # remaining document credits
    messages: int  # remaining chat-message credits


class CountsOut(BaseModel):
    documents: int
    documents_ready: int
    documents_processing: int
    documents_failed: int
    sessions: int
    user_messages: int  # questions the user has asked, across all chats


class RecentSessionOut(BaseModel):
    id: uuid.UUID
    title: str | None  # null until the first turn has been titled
    updated_at: datetime


class RecentDocumentOut(BaseModel):
    id: uuid.UUID
    file_name: str
    status: DocumentStatus
    error_code: str | None
    created_at: datetime


class ActivityOut(BaseModel):
    """One credit ledger entry, newest first."""

    kind: str  # "signup" | "usage" | "refund"
    unit_type: str  # "document" | "message"
    amount_delta: int  # negative = spent, positive = granted or refunded
    file_name: str | None  # set for document entries
    description: str | None
    created_at: datetime


class DailyUsageOut(BaseModel):
    date: date  # UTC day
    documents: int  # net document credits spent that day (usage minus refunds)
    messages: int  # net message credits spent that day


class UsageOut(BaseModel):
    documents_spent: int  # lifetime, net of refunds
    messages_spent: int
    daily: list[DailyUsageOut]  # oldest first, one entry per day (zero-filled), today last


class DashboardOut(BaseModel):
    balances: BalancesOut
    counts: CountsOut
    recent_sessions: list[RecentSessionOut]  # most recently active first, titles only
    recent_documents: list[RecentDocumentOut]  # newest first
    recent_activity: list[ActivityOut]  # newest first
    usage: UsageOut

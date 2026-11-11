import uuid
from datetime import datetime

from pydantic import BaseModel


class SignupCreditsOut(BaseModel):
    granted: bool  # False when the account already existed (the call is idempotent)
    credit_balance: int
    message_balance: int


class CreditTransactionOut(BaseModel):
    transaction_id: uuid.UUID
    unit_type: str  # "document" | "message"
    transaction_type: str  # "signup" | "usage" | "refund"
    amount_delta: int
    reference_id: uuid.UUID | None
    file_name_snapshot: str | None
    description: str | None
    created_at: datetime


class CreditHistoryOut(BaseModel):
    transactions: list[CreditTransactionOut]

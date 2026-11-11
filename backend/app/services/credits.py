"""Credits: atomic reserve / refund plus the idempotent signup grant.

Every function works inside the *caller's* transaction and never commits, so a credit change
and the row it pays for (a document, a chat message) succeed or fail together.

Two credit kinds, each with its own balance column: `document` (credit_balance) and
`message` (message_balance). The balance is never read-then-written: reserve is a single
conditional UPDATE, so concurrent requests cannot double-spend (and the table has CHECK
constraints as a backstop).
"""

import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.errors import ApiError, ErrorCode

UnitType = Literal["document", "message"]

_BALANCE_COLUMN: dict[str, str] = {"document": "credit_balance", "message": "message_balance"}


@dataclass
class Balances:
    credit_balance: int
    message_balance: int


async def grant_signup(session: AsyncSession, user_id: str) -> bool:
    """Grant the signup credits once. Returns True if granted now, False if the account existed.

    Idempotent: the account row is `INSERT ... ON CONFLICT DO NOTHING`, and the two `signup`
    ledger rows are written only by the call that actually inserted the account.
    """
    s = get_settings()
    inserted = (
        await session.execute(
            text(
                "INSERT INTO credit_accounts (user_id, credit_balance, message_balance) "
                "VALUES (:u, :docs, :msgs) ON CONFLICT (user_id) DO NOTHING RETURNING user_id"
            ),
            {"u": user_id, "docs": s.signup_doc_credits, "msgs": s.signup_message_credits},
        )
    ).first()
    if inserted is None:
        return False
    for unit_type, amount in (
        ("document", s.signup_doc_credits),
        ("message", s.signup_message_credits),
    ):
        await _write_transaction(
            session,
            user_id=user_id,
            unit_type=unit_type,
            transaction_type="signup",
            amount_delta=amount,
            description="Signup credits",
        )
    return True


async def get_balances(session: AsyncSession, user_id: str) -> Balances | None:
    row = (
        await session.execute(
            text(
                "SELECT credit_balance, message_balance FROM credit_accounts WHERE user_id = :u"
            ),
            {"u": user_id},
        )
    ).first()
    return None if row is None else Balances(row.credit_balance, row.message_balance)


async def reserve(
    session: AsyncSession,
    user_id: str,
    unit_type: UnitType,
    *,
    amount: int = 1,
    reference_id: uuid.UUID | None = None,
    file_name: str | None = None,
    description: str | None = None,
) -> None:
    """Atomically take `amount` credits and write the `usage` ledger row.

    Raises ApiError(INSUFFICIENT_CREDITS) (HTTP 402) when the balance is too low; nothing is
    written in that case. A user with no account row yet (created before the rebuild) is
    given the signup grant lazily and the reservation is retried once.
    """
    column = _BALANCE_COLUMN[unit_type]
    sql = text(
        f"UPDATE credit_accounts SET {column} = {column} - :n, updated_at = now() "
        f"WHERE user_id = :u AND {column} >= :n RETURNING {column}"
    )
    params = {"u": user_id, "n": amount}
    taken = (await session.execute(sql, params)).first()
    if taken is None and await grant_signup(session, user_id):
        taken = (await session.execute(sql, params)).first()
    if taken is None:
        raise ApiError(ErrorCode.INSUFFICIENT_CREDITS)
    await _write_transaction(
        session,
        user_id=user_id,
        unit_type=unit_type,
        transaction_type="usage",
        amount_delta=-amount,
        reference_id=reference_id,
        file_name_snapshot=file_name,
        description=description,
    )


async def refund(
    session: AsyncSession,
    user_id: str,
    unit_type: UnitType,
    *,
    amount: int = 1,
    reference_id: uuid.UUID | None = None,
    file_name: str | None = None,
    description: str | None = None,
) -> bool:
    """Give credits back and write a compensating `refund` ledger row.

    When `reference_id` is given the refund is idempotent per (reference, unit type): a second
    refund for the same document or message is a no-op that returns False. (Callers should
    also gate on a state change, e.g. the document leaving `processing`, to be race-safe.)
    """
    if reference_id is not None:
        already = (
            await session.execute(
                text(
                    "SELECT 1 FROM credit_transactions WHERE user_id = :u AND unit_type = :t "
                    "AND reference_id = :r AND transaction_type = 'refund' LIMIT 1"
                ),
                {"u": user_id, "t": unit_type, "r": reference_id},
            )
        ).first()
        if already is not None:
            return False
    column = _BALANCE_COLUMN[unit_type]
    updated = (
        await session.execute(
            text(
                f"UPDATE credit_accounts SET {column} = {column} + :n, updated_at = now() "
                f"WHERE user_id = :u RETURNING user_id"
            ),
            {"u": user_id, "n": amount},
        )
    ).first()
    if updated is None:  # account vanished (deleted user): nothing to refund into
        return False
    await _write_transaction(
        session,
        user_id=user_id,
        unit_type=unit_type,
        transaction_type="refund",
        amount_delta=amount,
        reference_id=reference_id,
        file_name_snapshot=file_name,
        description=description,
    )
    return True


async def _write_transaction(
    session: AsyncSession,
    *,
    user_id: str,
    unit_type: str,
    transaction_type: str,
    amount_delta: int,
    reference_id: uuid.UUID | None = None,
    file_name_snapshot: str | None = None,
    description: str | None = None,
) -> None:
    await session.execute(
        text(
            "INSERT INTO credit_transactions (user_id, unit_type, transaction_type, "
            "amount_delta, reference_id, file_name_snapshot, description) "
            "VALUES (:u, :t, :tt, :d, :r, :f, :desc)"
        ),
        {
            "u": user_id,
            "t": unit_type,
            "tt": transaction_type,
            "d": amount_delta,
            "r": reference_id,
            "f": file_name_snapshot,
            "desc": description,
        },
    )


async def list_transactions(
    session: AsyncSession, user_id: str, *, limit: int = 50, offset: int = 0
) -> list[dict[str, object]]:
    rows = (
        await session.execute(
            text(
                "SELECT transaction_id, unit_type, transaction_type, amount_delta, reference_id, "
                "file_name_snapshot, description, created_at FROM credit_transactions "
                "WHERE user_id = :u ORDER BY created_at DESC, transaction_id DESC "
                "LIMIT :l OFFSET :o"
            ),
            {"u": user_id, "l": limit, "o": offset},
        )
    ).mappings()
    return [dict(r) for r in rows]

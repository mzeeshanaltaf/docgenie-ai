"""Aggregates for `GET /v1/dashboard`: a handful of cheap queries, nothing heavy.

Everything is scoped by `user_id`. Only titles and counts leave this module: no message bodies,
no file bytes. Usage is derived from the credit ledger (`credit_transactions`), the same source
the balances come from, so the numbers cannot drift from what the user was actually charged.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.billing import CreditTransaction
from app.models.chat import ChatSession
from app.models.documents import Document
from app.schemas.dashboard import (
    ActivityOut,
    BalancesOut,
    CountsOut,
    DailyUsageOut,
    DashboardOut,
    RecentDocumentOut,
    RecentSessionOut,
    UsageOut,
)

# One round trip for the balances and every count.
_SUMMARY_SQL = text(
    """
    WITH d AS (
        SELECT count(*) AS total,
               count(*) FILTER (WHERE status = 'ready') AS ready,
               count(*) FILTER (WHERE status = 'processing') AS processing,
               count(*) FILTER (WHERE status = 'failed') AS failed
        FROM documents WHERE user_id = :u
    )
    SELECT a.credit_balance, a.message_balance, d.total, d.ready, d.processing, d.failed,
           (SELECT count(*) FROM chat_sessions WHERE user_id = :u) AS sessions,
           (SELECT count(*) FROM chat_messages WHERE user_id = :u AND role = 'user') AS user_messages
    FROM d LEFT JOIN credit_accounts a ON a.user_id = :u
    """
)
# (LEFT JOIN so a user without a credit account still yields one row, with NULL balances.)

# Net spend per UTC day and unit type: usage rows are negative, refunds positive.
_USAGE_SQL = text(
    """
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day, unit_type, -sum(amount_delta) AS spent
    FROM credit_transactions
    WHERE user_id = :u AND transaction_type IN ('usage', 'refund')
    GROUP BY 1, 2
    """
)


async def build_dashboard(session: AsyncSession, user_id: str) -> DashboardOut:
    s = get_settings()

    summary = (await session.execute(_SUMMARY_SQL, {"u": user_id})).one()
    # Strictly read-only: a user with no credit account shows 0 / 0 and nothing is written. (An
    # earlier version granted the signup credits here, which re-created an account for a user
    # who had just been deleted.) Accounts are created by the signup hook and, as a safety net,
    # by `credits.reserve` on first use.
    credit_balance = summary.credit_balance or 0
    message_balance = summary.message_balance or 0

    recent_sessions = (
        await session.execute(
            select(ChatSession.id, ChatSession.title, ChatSession.updated_at)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.updated_at.desc())
            .limit(s.dashboard_recent_limit)
        )
    ).all()
    recent_documents = (
        await session.execute(
            select(
                Document.id,
                Document.file_name,
                Document.status,
                Document.error_code,
                Document.created_at,
            )
            .where(Document.user_id == user_id)
            .order_by(Document.created_at.desc())
            .limit(s.dashboard_recent_limit)
        )
    ).all()
    activity = (
        await session.execute(
            select(
                CreditTransaction.transaction_type,
                CreditTransaction.unit_type,
                CreditTransaction.amount_delta,
                CreditTransaction.file_name_snapshot,
                CreditTransaction.description,
                CreditTransaction.created_at,
            )
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.created_at.desc(), CreditTransaction.transaction_id.desc())
            .limit(s.dashboard_activity_limit)
        )
    ).all()
    usage_rows = (await session.execute(_USAGE_SQL, {"u": user_id})).all()
    await session.rollback()  # read-only request: end the transaction explicitly

    return DashboardOut(
        balances=BalancesOut(documents=credit_balance, messages=message_balance),
        counts=CountsOut(
            documents=summary.total,
            documents_ready=summary.ready,
            documents_processing=summary.processing,
            documents_failed=summary.failed,
            sessions=summary.sessions,
            user_messages=summary.user_messages,
        ),
        recent_sessions=[
            RecentSessionOut(id=r.id, title=r.title, updated_at=r.updated_at)
            for r in recent_sessions
        ],
        recent_documents=[
            RecentDocumentOut(
                id=r.id,
                file_name=r.file_name,
                status=r.status,
                error_code=r.error_code,
                created_at=r.created_at,
            )
            for r in recent_documents
        ],
        recent_activity=[
            ActivityOut(
                kind=r.transaction_type,
                unit_type=r.unit_type,
                amount_delta=r.amount_delta,
                file_name=r.file_name_snapshot,
                description=r.description,
                created_at=r.created_at,
            )
            for r in activity
        ],
        usage=_usage(usage_rows, s.dashboard_usage_days),
    )


def _usage(rows: list, days: int) -> UsageOut:
    """Lifetime totals plus a zero-filled per-day series ending today (UTC)."""
    totals = {"document": 0, "message": 0}
    per_day: dict[object, dict[str, int]] = {}
    for r in rows:
        spent = int(r.spent)
        totals[r.unit_type] = totals.get(r.unit_type, 0) + spent
        per_day.setdefault(r.day, {})[r.unit_type] = spent
    today = datetime.now(UTC).date()
    series = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        counts = per_day.get(day, {})
        series.append(
            DailyUsageOut(
                date=day, documents=counts.get("document", 0), messages=counts.get("message", 0)
            )
        )
    return UsageOut(
        documents_spent=totals["document"], messages_spent=totals["message"], daily=series
    )

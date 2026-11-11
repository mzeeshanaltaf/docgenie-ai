"""Credits against a real Postgres schema (see conftest.py)."""

import asyncio
import uuid

from sqlalchemy import text

from app.db import get_sessionmaker
from app.errors import ApiError, ErrorCode
from app.services import credits
from tests.conftest import headers_for


async def balances(uid: str) -> tuple[int, int]:
    async with get_sessionmaker()() as s:
        b = await credits.get_balances(s, uid)
    assert b is not None
    return b.credit_balance, b.message_balance


async def reserve_once(uid: str, unit: str = "document") -> bool:
    """One reservation in its own transaction. True = reserved, False = rejected with 402."""
    try:
        async with get_sessionmaker()() as s, s.begin():
            await credits.reserve(s, uid, unit)  # type: ignore[arg-type]
        return True
    except ApiError as exc:
        assert exc.code == ErrorCode.INSUFFICIENT_CREDITS and exc.status_code == 402
        return False


async def test_signup_grant_is_idempotent(infra, user_id):
    async def grant() -> bool:
        async with get_sessionmaker()() as s, s.begin():
            return await credits.grant_signup(s, user_id)

    results = await asyncio.gather(*[grant() for _ in range(5)])  # even when racing
    assert results.count(True) == 1
    assert await balances(user_id) == (5, 25)
    async with get_sessionmaker()() as s:
        n = (
            await s.execute(
                text("SELECT count(*) FROM credit_transactions WHERE user_id = :u"), {"u": user_id}
            )
        ).scalar_one()
    assert n == 2  # one signup row per unit type, written once


async def test_signup_endpoint_idempotent(db_client, user_id):
    h = {"X-Internal-Key": "test-internal-key"}  # no X-User-Id: the user id is in the path
    first = await db_client.post(f"/v1/users/{user_id}/signup-credits", headers=h)
    second = await db_client.post(f"/v1/users/{user_id}/signup-credits", headers=h)
    assert first.status_code == second.status_code == 200
    assert first.json() == {"granted": True, "credit_balance": 5, "message_balance": 25}
    assert second.json() == {"granted": False, "credit_balance": 5, "message_balance": 25}


async def test_signup_endpoint_requires_internal_key(db_client, user_id):
    assert (await db_client.post(f"/v1/users/{user_id}/signup-credits")).status_code == 401


async def test_concurrent_reservations_never_double_spend(infra, user_id):
    async with get_sessionmaker()() as s, s.begin():
        await credits.grant_signup(s, user_id)  # 5 document credits
    results = await asyncio.gather(*[reserve_once(user_id) for _ in range(25)])
    assert results.count(True) == 5
    assert results.count(False) == 20
    assert await balances(user_id) == (0, 25)
    async with get_sessionmaker()() as s:
        usage_rows = (
            await s.execute(
                text(
                    "SELECT count(*) FROM credit_transactions "
                    "WHERE user_id = :u AND transaction_type = 'usage'"
                ),
                {"u": user_id},
            )
        ).scalar_one()
    assert usage_rows == 5  # a rejected reservation writes nothing


async def test_message_credits_are_separate(infra, user_id):
    async with get_sessionmaker()() as s, s.begin():
        await credits.grant_signup(s, user_id)
    assert await reserve_once(user_id, "message")
    assert await balances(user_id) == (5, 24)


async def test_zero_credits_rejected(infra, user_id):
    async with get_sessionmaker()() as s, s.begin():
        await credits.grant_signup(s, user_id)
        await s.execute(
            text("UPDATE credit_accounts SET credit_balance = 0 WHERE user_id = :u"), {"u": user_id}
        )
    assert await reserve_once(user_id) is False
    assert await balances(user_id) == (0, 25)


async def test_user_without_account_gets_lazy_signup_grant(infra, user_id):
    assert await reserve_once(user_id)  # no account row yet (a pre-rebuild user)
    assert await balances(user_id) == (4, 25)


async def test_refund_writes_compensating_transaction_once(infra, user_id):
    ref = uuid.uuid4()
    async with get_sessionmaker()() as s, s.begin():
        await credits.reserve(s, user_id, "document", reference_id=ref, file_name="a.pdf")
    assert await balances(user_id) == (4, 25)
    async with get_sessionmaker()() as s, s.begin():
        assert await credits.refund(s, user_id, "document", reference_id=ref, file_name="a.pdf")
    async with get_sessionmaker()() as s, s.begin():
        assert not await credits.refund(s, user_id, "document", reference_id=ref)  # idempotent
    assert await balances(user_id) == (5, 25)
    async with get_sessionmaker()() as s:
        rows = (
            await s.execute(
                text(
                    "SELECT transaction_type, amount_delta FROM credit_transactions "
                    "WHERE user_id = :u AND reference_id = :r ORDER BY created_at, amount_delta"
                ),
                {"u": user_id, "r": ref},
            )
        ).all()
    assert sorted(rows) == [("refund", 1), ("usage", -1)]


async def test_history_newest_first_and_scoped_to_user(db_client, user_id):
    other = f"{user_id}_other"
    await db_client.post(f"/v1/users/{user_id}/signup-credits", headers={"X-Internal-Key": "test-internal-key"})
    await db_client.post(f"/v1/users/{other}/signup-credits", headers={"X-Internal-Key": "test-internal-key"})
    async with get_sessionmaker()() as s, s.begin():
        await credits.reserve(s, user_id, "document", file_name="x.pdf")
    resp = await db_client.get("/v1/credits/history", headers=headers_for(user_id))
    assert resp.status_code == 200
    txs = resp.json()["transactions"]
    assert len(txs) == 3
    assert txs[0]["transaction_type"] == "usage" and txs[0]["amount_delta"] == -1
    assert txs[0]["file_name_snapshot"] == "x.pdf"
    assert {t["transaction_type"] for t in txs[1:]} == {"signup"}
    created = [t["created_at"] for t in txs]
    assert created == sorted(created, reverse=True)


async def test_history_requires_user_header(db_client):
    resp = await db_client.get("/v1/credits/history", headers={"X-Internal-Key": "test-internal-key"})
    assert resp.status_code == 401

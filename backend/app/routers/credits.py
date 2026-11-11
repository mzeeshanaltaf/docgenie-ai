from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.schemas.credits import CreditHistoryOut, CreditTransactionOut, SignupCreditsOut
from app.services import credits

router = APIRouter(tags=["credits"])


@router.post("/users/{user_id}/signup-credits", response_model=SignupCreditsOut)
async def grant_signup_credits(
    user_id: str, session: AsyncSession = Depends(get_session)
) -> SignupCreditsOut:
    """Idempotent signup grant. Called by Next.js server-side right after a user is created
    (the user id comes from the path; no session exists yet, so no X-User-Id is needed)."""
    async with session.begin():
        granted = await credits.grant_signup(session, user_id)
        balances = await credits.get_balances(session, user_id)
    assert balances is not None
    return SignupCreditsOut(
        granted=granted,
        credit_balance=balances.credit_balance,
        message_balance=balances.message_balance,
    )


@router.get("/credits/history", response_model=CreditHistoryOut)
async def credit_history(
    user_id: CurrentUserId,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: AsyncSession = Depends(get_session),
) -> CreditHistoryOut:
    """The caller's credit transactions, newest first."""
    rows = await credits.list_transactions(session, user_id, limit=limit, offset=offset)
    return CreditHistoryOut(
        transactions=[CreditTransactionOut.model_validate(r) for r in rows]
    )

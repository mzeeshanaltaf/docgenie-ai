from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CurrentUserId
from app.schemas.dashboard import DashboardOut
from app.services.dashboard import build_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
async def get_dashboard(
    user_id: CurrentUserId, session: AsyncSession = Depends(get_session)
) -> DashboardOut:
    """Balances, counts, recent sessions (titles only), recent documents, recent credit activity
    and usage. Small enough to fetch on every dashboard load."""
    return await build_dashboard(session, user_id)

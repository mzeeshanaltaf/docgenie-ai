from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session

router = APIRouter(tags=["health"])


@router.get("/health", response_model=None)
async def health(session: AsyncSession = Depends(get_session)) -> Any:
    """Liveness plus a DB check. The storage check is added in Phase 2."""
    checks: dict[str, str] = {}
    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001 - report, don't raise
        checks["database"] = "error"
    healthy = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"success": healthy, "status": "ok" if healthy else "degraded", "checks": checks},
    )

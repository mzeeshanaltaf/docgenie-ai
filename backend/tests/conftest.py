import os

# Must be set before app.config is imported anywhere.
os.environ["INTERNAL_API_KEY"] = "test-internal-key"
os.environ.setdefault("DATABASE_URL", "postgresql://x:y@127.0.0.1:1/none")

import pytest
from fastapi import APIRouter, Depends
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.deps import CurrentUserId, verify_internal_key
from app.errors import ApiError, ErrorCode
from app.main import create_app

get_settings.cache_clear()


@pytest.fixture
def app():
    app = create_app()
    # Test-only routes, mounted exactly like real /v1 routes.
    r = APIRouter(prefix="/v1/_test", dependencies=[Depends(verify_internal_key)])

    @r.get("/me")
    async def me(user_id: CurrentUserId) -> dict[str, str]:
        return {"user_id": user_id}

    @r.get("/raise/{code}")
    async def raise_code(code: ErrorCode) -> None:
        raise ApiError(code, details={"k": "v"})

    @r.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret internals")

    app.include_router(r)
    return app


@pytest.fixture
async def client(app):
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as c:
        yield c


KEY = {"X-Internal-Key": "test-internal-key"}

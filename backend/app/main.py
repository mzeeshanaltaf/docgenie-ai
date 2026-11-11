import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI

from app.db import dispose_engine, get_engine
from app.deps import verify_internal_key
from app.errors import register_error_handlers
from app.routers import health

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_engine()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title="DocGenie backend",
        version="0.1.0",
        lifespan=lifespan,
        # Private service: no public docs surface.
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    register_error_handlers(app)

    # Every /v1 route requires X-Internal-Key. Routes that act for a user also
    # depend on `current_user_id` (X-User-Id).
    v1 = APIRouter(prefix="/v1", dependencies=[Depends(verify_internal_key)])
    v1.include_router(health.router)
    app.include_router(v1)
    return app


app = create_app()

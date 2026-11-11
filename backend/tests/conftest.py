import os
import secrets

# Must be set before app.config / app.db are imported anywhere.
os.environ["INTERNAL_API_KEY"] = "test-internal-key"
# DB tests run in a throwaway schema (created and dropped by the `db_schema` fixture) on the
# database from backend/.env. The name is fixed at import time because the ORM metadata
# captures it.
TEST_SCHEMA = f"docgenie_test_{secrets.token_hex(4)}"
os.environ["DB_SCHEMA"] = TEST_SCHEMA
# Object storage tests use their own bucket on the local MinIO (docker-compose.dev.yml).
os.environ["S3_BUCKET"] = os.environ.get("TEST_S3_BUCKET", "docgenie-test")

import types
from collections.abc import AsyncIterator

import pytest
from fastapi import APIRouter, Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.config import get_settings
from app.deps import CurrentUserId, verify_internal_key
from app.errors import ApiError, ErrorCode
from app.main import create_app
from app.services.usage import Usage

get_settings.cache_clear()

KEY = {"X-Internal-Key": "test-internal-key"}


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


# ---------------------------------------------------------------------------
# Real Postgres (throwaway schema) + real MinIO
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
async def db_schema() -> AsyncIterator[str]:
    """Create the throwaway schema with all app tables; drop it at the end of the run."""
    import app.models  # noqa: F401  (register every table on Base.metadata)
    from app.db import Base, dispose_engine, get_engine

    settings = get_settings()
    if not settings.database_url:
        pytest.skip("DATABASE_URL is not configured")
    engine = get_engine()
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{TEST_SCHEMA}"'))
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:  # noqa: BLE001
        await dispose_engine()
        pytest.skip(f"database not reachable: {exc!r}")
    try:
        yield TEST_SCHEMA
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
        await dispose_engine()


@pytest.fixture(scope="session")
async def storage_ready() -> AsyncIterator[None]:
    from app.services import storage

    if not get_settings().s3_endpoint:
        pytest.skip("S3_ENDPOINT is not configured")
    try:
        await storage.ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"object storage not reachable: {exc!r}")
    yield
    # The test bucket is dedicated to the suite: leave it empty.
    await storage.delete_prefix("users/")


@pytest.fixture
async def infra(db_schema, storage_ready) -> None:
    """Depend on this from any test that needs the database and MinIO."""


@pytest.fixture
def user_id() -> str:
    return f"user_{secrets.token_hex(6)}"


@pytest.fixture
def headers(user_id: str) -> dict[str, str]:
    return {**KEY, "X-User-Id": user_id}


def headers_for(uid: str) -> dict[str, str]:
    return {**KEY, "X-User-Id": uid}


@pytest.fixture
async def db_client(infra, app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as c:
        yield c


class FakeOpenAI:
    """Stands in for the OpenAI client: deterministic embeddings, optional failure."""

    def __init__(self) -> None:
        self.fail_embeddings = False
        self.embedding_calls = 0
        self.embeddings = types.SimpleNamespace(create=self._create_embeddings)

    async def _create_embeddings(self, *, model: str, input: list[str]):
        self.embedding_calls += 1
        if self.fail_embeddings:
            raise RuntimeError("embedding service down")
        data = [
            types.SimpleNamespace(index=i, embedding=_fake_vector(t)) for i, t in enumerate(input)
        ]
        tokens = sum(len(t.split()) for t in input)
        return types.SimpleNamespace(
            data=data, usage=types.SimpleNamespace(total_tokens=tokens, prompt_tokens=tokens)
        )


def _fake_vector(text_: str, dim: int = 1536) -> list[float]:
    seed = sum(ord(c) for c in text_) % 997
    return [((seed + i) % 17) / 17.0 for i in range(dim)]


@pytest.fixture
def fake_openai(monkeypatch) -> FakeOpenAI:
    """Replace embeddings and OCR with offline fakes (the real e2e check is a script)."""
    fake = FakeOpenAI()
    monkeypatch.setattr("app.services.embeddings.get_client", lambda: fake)

    async def fake_transcribe(png: bytes) -> tuple[str, Usage]:
        assert png[:8] == b"\x89PNG\r\n\x1a\n"  # a real rendered page image was produced
        return "Scanned page text from OCR", Usage(input_tokens=100, output_tokens=20)

    monkeypatch.setattr("app.services.ocr._transcribe", fake_transcribe)
    return fake

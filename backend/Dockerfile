FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.8.3 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first for layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# /v1/health requires X-Internal-Key like every other route, so the container
# health check sends it. (Phase 11 wires this in Coolify.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request as u;r=u.Request('http://127.0.0.1:8000/v1/health',headers={'X-Internal-Key':os.environ.get('INTERNAL_API_KEY','')});u.urlopen(r,timeout=4)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

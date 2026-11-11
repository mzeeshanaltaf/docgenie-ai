# Phase 1: Backend foundation

**Goal:** a running, private FastAPI service with configuration, database schema, internal auth, error handling and a health check, plus proof that the chosen model supports every feature the plan depends on.

**Depends on:** nothing. This is the first phase.
**Unblocks:** every backend phase (2, 3, 4).

## Session handoff

**Read before starting:** [README.md](README.md) (protocol, decisions, conventions) and the Current state in [progress.md](progress.md). There are no earlier phase entries.

**Record in the handoff** (in `progress.md`):
- Smoke-test result for each model feature (flex tier, reasoning effort, reasoning summaries, image input), with the exact model ids used and any SDK parameter names that differed from the plan.
- Exact commands to install deps, start the backend, run migrations and run tests.
- Backend env var names added to `backend/.env` / `.env.example`.
- How the `vector` extension is enabled (migration vs. pre-existing) and the Alembic head revision.
- How later phases raise API errors (the helper/exception class and its module path) and the names of the auth dependencies (e.g. `current_user_id`).
- Whether the n8n key was rotated and `n8n_workflows/` gitignored.

## Background

DocGenie's backend today is 8 n8n workflows reached through Next.js proxy routes. An analysis of those workflows found these problems:

- A stray wire skips the upload credit check, so users with 0 credits can still ingest documents.
- The chat agent runs SQL written by the model, using the full DB credential, in the same schema as the auth tables.
- The Credits webhook has no authentication.
- Files are stored as Postgres `bytea` and sent to the browser as base64 on every dashboard load.
- AI responses are stored JSON-escaped.
- Chat errors show up as "No response".

The fix is a separate Python FastAPI service that owns all business logic. Next.js keeps routing, auth and UI.

### Decisions already confirmed

| Topic | Decision |
|---|---|
| Browser to backend | Next.js API routes stay as thin authenticated proxies; FastAPI is private |
| Upload limit | 20 MB and 50 pages per document (configurable) |
| Rollout | Build and verify locally; the Coolify deploy is a final phase, confirmed separately |
| Data | `document_genie` app data is dummy; app tables may be dropped and rebuilt. Better Auth tables (`user`, `session`, `account`, `verification`) are kept untouched |

### Assumptions to confirm before starting

- `gpt-6-luna` is used exactly as given. The smoke test in this phase must confirm it accepts `service_tier: "flex"`, `reasoning.effort: "medium"`, reasoning summaries, and image input (for OCR). **If any of these is unsupported, stop and report. Do not substitute another model or setting silently.**

## Before starting: housekeeping

- **Rotate the n8n API key.** Four workflow exports contain a live `x-api-key` in pinned data.
- Add `n8n_workflows/` to `.gitignore` so the exports never get committed.

## Repository layout created in this phase

```
backend/                      # new, self-contained Python service
  pyproject.toml              # uv, Python 3.12
  Dockerfile
  alembic/                    # migrations
  app/
    main.py                   # FastAPI app, lifespan, routers, error handlers
    config.py                 # pydantic-settings: every tunable in one place
    deps.py                   # internal-auth + current-user dependencies
    db.py                     # async SQLAlchemy engine (asyncpg), search_path=document_genie
    models/                   # SQLAlchemy models
    schemas/                  # Pydantic request/response models
    routers/                  # health now; others added in later phases
    services/
      llm.py                  # OpenAI Responses API wrapper (smoke-test level for now)
  tests/
```

## Tasks

### 1. Scaffold
- `backend/pyproject.toml` managed by `uv`, Python 3.12.
- `backend/Dockerfile` (it gets used in Phase 11).
- `app/main.py` with lifespan, router registration and error handlers.

### 2. Configuration (`app/config.py`)
One `Settings` class. Every value can be overridden by env, and nothing in later phases is hardcoded.

- **LLM:** `CHAT_MODEL=gpt-6-luna`, `CHAT_REASONING_EFFORT=medium`, `CHAT_SERVICE_TIER=flex`, `TITLE_MODEL`, `OCR_MODEL`, `EMBEDDING_MODEL=text-embedding-3-small`, `EMBEDDING_DIM=1536`, `LLM_TIMEOUT_S` (flex needs a long timeout), `FLEX_FALLBACK_TIER=default` (used when flex returns resource-unavailable), `AGENT_MAX_STEPS=8`.
- **Limits:** `MAX_UPLOAD_MB=20`, `MAX_PAGES=50`, `MAX_CSV_ROWS=10000`, `MAX_EXTRACTED_CHARS`, `ALLOWED_MIME_TYPES`, `TXT_WORDS_PER_PAGE=500`.
- **Retrieval:** `CHUNK_SIZE=1000`, `CHUNK_OVERLAP=200`, `RETRIEVAL_TOP_K=8`, `RRF_K=60`, `HISTORY_WINDOW=20`.
- **Credits:** `SIGNUP_DOC_CREDITS=5`, `SIGNUP_MESSAGE_CREDITS=25`.
- **Infra:** `DATABASE_URL`, `OPENAI_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `INTERNAL_API_KEY`, `RESEND_API_KEY`, `CONTACT_NOTIFY_EMAIL`.
- **`PRICING`** table (model + tier → $/1M input and output tokens), used later for cost logging.

### 3. Database engine (`app/db.py`)
Async SQLAlchemy on `asyncpg`, with `search_path` pinned to `document_genie`.

### 4. Migrations (Alembic, schema `document_genie`)
Drop the old app tables: `user_documents`, `user_document_rows`, `user_document_embeddings`, `user_chat_histories`, `n8n_user_chat_histories`, `user_credit_accounts`, `user_credit_transactions`.

Create:

| Table | Key columns |
|---|---|
| `documents` | `id uuid pk`, `user_id`, `file_name`, `mime_type`, `file_size`, `num_pages`, `storage_key`, `checksum` (SHA-256), `status` (`processing`/`ready`/`failed`), `error_code`, `csv_schema jsonb`, `ocr_used bool`; **unique `(user_id, checksum)`** |
| `document_chunks` | `id`, `document_id fk cascade`, `user_id`, `chunk_index`, `page_start`, `page_end`, `content`, `embedding vector(1536)` (HNSW cosine), `tsv tsvector` generated from `content` (GIN) |
| `document_rows` | `id`, `document_id fk cascade`, `user_id`, `row_index`, `row_data jsonb` |
| `chat_sessions` | `id uuid pk` (client-generated), `user_id`, `title`, `document_ids uuid[]` (null = all documents), timestamps |
| `chat_messages` | `id uuid pk`, `session_id fk cascade`, `user_id`, `role`, `content text`, `parts jsonb` (reasoning, tool calls, citations), `metrics jsonb` (ttft_ms, total_ms, output_tokens, tokens_per_s), `model`, `status`, `created_at` |
| `message_feedback` | `message_id pk fk cascade`, `user_id`, `rating` (`like`/`dislike`), `reason`, `comment` |
| `credit_accounts`, `credit_transactions` | same as today, plus an index on `transactions(user_id, created_at)` |
| `llm_usage` | `user_id`, `session_id`, `kind` (chat/title/ocr/embedding), `model`, `service_tier`, token counts, `cost_usd` |
| `contact_submissions` | `name`, `email`, `message`, `ip`, `created_at` |

Do not touch the Better Auth tables. Make sure the `vector` extension is available.

### 5. Internal auth (`app/deps.py`)
- Every request must carry `X-Internal-Key`. Compare it against `INTERNAL_API_KEY` in constant time and reject on mismatch.
- Every request must carry `X-User-Id`. Next.js sets it from the Better Auth session, never from the browser. Expose it as a `current_user_id` dependency.
- Every query in later phases is scoped by this user id. That closes the "user_id trusted from body" and missing-ownership-check holes.
- FastAPI is never exposed publicly.

### 6. Error handling
All routes live under `/v1`. Error bodies keep the existing `{success, status, message, details}` shape. Define these error codes now so later phases can raise them:

| Code | HTTP |
|---|---|
| `INSUFFICIENT_CREDITS` | 402 |
| `FILE_TOO_LARGE` | 413 |
| `DUPLICATE_DOCUMENT` | 409 |
| `PAGE_LIMIT_EXCEEDED`, `ROWS_LIMIT_EXCEEDED` | 400 |
| `UNSUPPORTED_TYPE` (new) | 415 |
| `NO_TEXT_FOUND` (new) | 422 |

### 7. Health (`GET /v1/health`)
Liveness and a DB check. The storage check is added in Phase 2.

### 8. Model smoke test
Make a minimal Responses API call against `CHAT_MODEL` with `service_tier="flex"`, `reasoning={"effort": "medium", "summary": "auto"}`, then an image-input call against `OCR_MODEL`. Record which features worked. **Stop and report if any feature is unsupported.**

## Exit criteria

- [ ] `uv run uvicorn app.main:app` starts, and `GET /v1/health` reports the DB as healthy.
- [ ] `alembic upgrade head` creates every table above in `document_genie`; the Better Auth tables are unchanged.
- [ ] Requests without a valid `X-Internal-Key` are rejected; requests without `X-User-Id` are rejected on user-scoped routes.
- [ ] Error responses use the `{success, status, message, details}` shape.
- [ ] Smoke-test results are recorded; all four model features are confirmed (or work is halted and reported).
- [ ] The n8n key is rotated and `n8n_workflows/` is gitignored.

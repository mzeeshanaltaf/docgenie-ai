# DocGenie rebuild: progress and handoff log

Read the protocol in [README.md](README.md) first. This file has two parts:

1. **Current state:** always up to date. Each session rewrites it at the end so it matches the repo at that point.
2. **Phase log:** one entry per finished (or partial) phase, appended in order and never rewritten afterwards.

No secrets anywhere in this file: record env var names and where their values live.

---

## Current state

_Last updated by: Phase 2 (done)_

### How to run locally
- Frontend: `npm run dev` (localhost:3000)
- MinIO (from the repo root): `docker compose -f docker-compose.dev.yml up -d` (starts MinIO and a one-shot job that creates the private buckets `docgenie` and `docgenie-test`). Stop with `docker compose -f docker-compose.dev.yml down` (data stays in the `docgenie-minio-data` volume).
- Backend (from `backend/`):
  - install: `uv sync`
  - run: `uv run uvicorn app.main:app --port 8765`
  - migrate: `uv run alembic upgrade head` (head `0001`; Phase 2 added no migration)
  - NOTE: port 8000 on the dev machine is occupied by an unrelated process; use `--port 8765` (or any free port)
  - tests: `uv run pytest -q`. Needs the MinIO container above and `DATABASE_URL` in `backend/.env`. Takes about 4 minutes because the DB is the remote VPS (about 1 s per round trip); the 40 unit tests alone (`uv run pytest tests/test_parsing_chunking.py tests/test_auth_and_errors.py tests/test_config.py -q`) take under a second. If the DB or MinIO is unreachable the integration tests skip instead of failing.
  - real end-to-end ingestion check (real OpenAI; start the server first): `PYTHONPATH=. uv run python scripts/e2e_ingest.py http://localhost:8765`. It cleans up after itself.
  - re-grant signup credits to existing Better Auth users (idempotent): `PYTHONPATH=. uv run python scripts/regrant_signup_credits.py [--dry-run]`
  - model smoke test: `PYTHONPATH=. uv run python scripts/smoke_models.py` (and `scripts/smoke_flex_probe.py`)
  - read-only DB inspection: `PYTHONPATH=. uv run python scripts/inspect_db.py [table ...]`

### Services and ports
| Service | Port | Notes |
|---|---|---|
| Next.js dev | 3000 | |
| FastAPI backend | 8000 | private; every `/v1` route needs `X-Internal-Key` |
| MinIO API | 9100 | `S3_ENDPOINT=http://localhost:9100`, bucket `docgenie` (private). Not 9000: another local project's MinIO already holds 9000/9001 |
| MinIO console | 9101 | login = `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from `backend/.env` |

### Env vars (names only)
| Var | Used by | Where the value lives | Added in phase |
|---|---|---|---|
| _existing vars are listed in `CLAUDE.md`_ | | | |
| `DATABASE_URL`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `INTERNAL_API_KEY` | backend | `backend/.env` (gitignored; seeded from root `.env.local`, `INTERNAL_API_KEY` generated) | 1 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | backend | `backend/.env` (set to the local MinIO in Phase 2); `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (optional) are read by `docker-compose.dev.yml` and must match the S3 key pair | 1 (set in 2) |
| `CONTACT_NOTIFY_EMAIL` | backend | declared in `app/config.py` + `backend/.env.example`, not set yet (Phase 4) | 1 |
| `TEST_S3_BUCKET` (optional) | pytest | overrides the test bucket (default `docgenie-test`); the suite also forces `DB_SCHEMA=docgenie_test_<random>` | 2 |
| All tunables (`CHAT_MODEL`, `MAX_UPLOAD_MB`, `CHUNK_SIZE`, ...) | backend | defaults in `backend/app/config.py`; list in `backend/.env.example` | 1 |
| Ingestion tunables: `OCR_MIN_CHARS_PER_PAGE` (25), `OCR_REASONING_EFFORT` (low), `OCR_RENDER_SCALE` (2.0), `OCR_CONCURRENCY` (4), `EMBEDDING_BATCH_SIZE` (64), `CSV_ROWS_PER_CHUNK_CHARS` (1500), `INGESTION_STALE_MINUTES` (10), `INGESTION_SWEEP_INTERVAL_S` (300) | backend | defaults in `backend/app/config.py` | 2 |
| `INTERNAL_API_KEY` (same value) | Next.js proxy | must be added to root `.env.local` in Phase 5 | 5 |

### Contracts later phases rely on
- **Raising errors:** `from app.errors import ApiError, ErrorCode`; `raise ApiError(ErrorCode.INSUFFICIENT_CREDITS)` (optional `message=`, `details=`). Body is `{success:false, status:<CODE>, message, details}`. Codes and HTTP map: `backend/app/errors.py`.
- **Auth deps:** `verify_internal_key` is applied to the whole `/v1` router in `app/main.py`. User-scoped routes take `user_id: CurrentUserId` (`from app.deps import CurrentUserId`; `current_user_id` is the underlying dependency). New routers are added via `v1.include_router(...)` in `create_app()`.
- **DB:** `app.db.get_session` (FastAPI dependency, AsyncSession), `Base` (metadata schema `document_genie`). Models in `backend/app/models/`. Search path is `document_genie,public`.
- **LLM:** `app.services.llm.respond(...)` is a thin non-streaming Responses wrapper; `app.services.llm.get_client()` returns the shared `AsyncOpenAI`. `PRICING` in `app/config.py` now has `("text-embedding-3-small", "default")` only; `gpt-6-luna` prices are still missing, so chat/OCR cost is logged as `NULL` until Phase 3 fills them.
- **Credits (`app/services/credits.py`)**: all functions work in the caller's transaction and never commit. `UnitType = "document" | "message"`.
  - `reserve(session, user_id, unit_type, *, amount=1, reference_id=None, file_name=None, description=None) -> None`: atomic conditional UPDATE plus a `usage` ledger row; raises `ApiError(INSUFFICIENT_CREDITS)` (402). A user with no account row gets the signup grant lazily, then the reservation is retried.
  - `refund(session, user_id, unit_type, *, amount=1, reference_id=None, file_name=None, description=None) -> bool`: balance + ledger `refund` row; idempotent per `(reference_id, unit_type)` (returns False if already refunded). Phase 3 must pass the message id as `reference_id`.
  - `grant_signup(session, user_id) -> bool`, `get_balances(session, user_id) -> Balances | None` (`.credit_balance`, `.message_balance`), `list_transactions(session, user_id, *, limit=50, offset=0) -> list[dict]`.
  - The balances are `credit_accounts.credit_balance` (documents) and `message_balance` (chat turns).
- **Storage (`app/services/storage.py`, boto3 in threads, all coroutines)**: `object_key(user_id, document_id, file_name) -> str` (`users/{user_id}/{document_id}/{safe name}`), `user_prefix(user_id) -> "users/{user_id}/"`, `safe_file_name(name)`, `put_file(key, path, content_type)`, `put_bytes(key, data, content_type=...)`, `open_object(key) -> StoredObject(body, content_length, content_type)` + `iter_object(obj)` (async chunk iterator), `read_bytes(key)`, `object_exists(key)`, `delete_object(key)`, `list_keys(prefix) -> list[str]`, `delete_prefix(prefix) -> int` (Phase 4 account deletion: `delete_prefix(user_prefix(uid))`), `ensure_bucket()`, `check_storage() -> bool`. All raise `storage.StorageError` on failure.
- **Usage (`app/services/usage.py`)**: `log_usage(session, *, user_id, kind, model, usage: Usage, service_tier="default", session_id=None)` adds an `llm_usage` row to the caller's transaction (kinds `chat|title|ocr|embedding`); `usage_from_response(resp) -> Usage`; `compute_cost(model, tier, usage)`.
- **Embeddings (`app/services/embeddings.py`)**: `embed_texts(texts) -> (vectors, Usage)` (batched), `embed_query(text) -> (vector, Usage)` for Phase 3 retrieval. Caller logs the usage with `kind="embedding"`.
- **Documents**: `app/services/documents.py` (`get_owned_document(session, user_id, document_id)` raises 404 for other users' ids, `list_documents`, `delete_document`). Response models in `app/schemas/documents.py` (`DocumentOut`, `DocumentListOut`). Chunks are in `document_chunks` (`content`, `page_start`, `page_end`, `embedding`, generated `tsv`); CSV rows in `document_rows` (`row_index` is 1-based, `row_data` JSONB, all values strings); the CSV schema is `documents.csv_schema`.
- **Ingestion failure codes** (`documents.error_code`, `app.errors.IngestionErrorCode`): `NO_TEXT_FOUND`, `PARSE_FAILED`, `OCR_FAILED`, `EMBEDDING_FAILED`, `STORAGE_FAILED` (reserved, not set today), `TEXT_TOO_LARGE`, `PROCESSING_INTERRUPTED` (set by the stale sweep), `INTERNAL_ERROR`.

### HTTP endpoints (all under `/v1`, all need `X-Internal-Key`; user-scoped ones also `X-User-Id`)
| Endpoint | Notes |
|---|---|
| `GET /health` | `{success, status, checks: {database, storage}}`; 503 if either is `error` |
| `POST /users/{user_id}/signup-credits` | No `X-User-Id` (id is in the path). Idempotent. `200 {granted, credit_balance, message_balance}` |
| `GET /credits/history?limit=50&offset=0` | `{transactions: [{transaction_id, unit_type, transaction_type, amount_delta, reference_id, file_name_snapshot, description, created_at}]}`, newest first. Balances are not returned here (Phase 4's dashboard endpoint does that) |
| `POST /documents` | multipart, field name `file`. `202` + `DocumentOut` (status `processing`). Errors: 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_TYPE`, 400 `PAGE_LIMIT_EXCEEDED` / `ROWS_LIMIT_EXCEEDED`, 409 `DUPLICATE_DOCUMENT`, 402 `INSUFFICIENT_CREDITS`, 422 `VALIDATION_ERROR` (no file / not multipart), 503 `STORAGE_UNAVAILABLE` |
| `GET /documents` | `{documents: [DocumentOut]}`, newest first, no file bytes |
| `GET /documents/{id}` | `DocumentOut`; the frontend polls it while `status == "processing"` |
| `GET /documents/{id}/content[?download=true]` | streams the original (`Content-Type` = stored mime, `inline` or `attachment`) |
| `DELETE /documents/{id}` | `204`; object, chunks and rows removed |

`DocumentOut` = `{id, file_name, mime_type, file_size, num_pages (null for CSV), status: processing|ready|failed, error_code, ocr_used, csv_schema, created_at}`. `storage_key` and `checksum` are never returned. A document of another user is a `404 NOT_FOUND`, not a 403.

### Decisions made during implementation
- **Credits assumption confirmed by the user (2026-11-11):** 5 documents + 25 messages on signup, 1 per upload and 1 per chat turn.
- **Failed documents can be re-uploaded.** A `failed` row would otherwise block the same file through the unique `(user_id, checksum)` index, so the create transaction deletes a same-checksum `failed` row first. Any other state is `409 DUPLICATE_DOCUMENT`.
- **A document deleted while `processing` is not refunded** (the credit was spent on the work in flight); its ingestion then finds no row and ends quietly.
- **The stale sweep is age-based** (`INGESTION_STALE_MINUTES=10`, run at startup and every 5 minutes) rather than "everything `processing` at boot", because the local and the eventual production backend share one Postgres: a local restart must not fail documents the other instance is still ingesting.
- **Local MinIO uses ports 9100/9101 and the `pgsty/minio` image** (the official `minio/minio` image is no longer on Docker Hub; 9000/9001 are held by another local project).
- **DB tests use a throwaway schema on the configured `DATABASE_URL`** (`docgenie_test_<random>`, dropped at the end) because that is the only Postgres with pgvector here; they never touch `document_genie`.
- `gpt-6-luna` confirmed for flex tier, `reasoning.effort=medium`, reasoning summaries and image input (see Phase 1 log). Assumption closed.
- **Service tier default changed from `flex` to `default` (user decision, 2026-11-11)** because flex 429s often. `CHAT_SERVICE_TIER=flex` remains an opt-in env override; `FLEX_FALLBACK_TIER` only matters in that case. Phase 3 should still catch the flex 429 and fall back if flex is ever enabled.
- `/v1/health` also requires `X-Internal-Key` (plan: every request). The Dockerfile health check sends it.
- `user_id` columns are `text` with no FK to Better Auth's `user` table (its id is `text`); Phase 4 account deletion must delete by `user_id`.
- Alembic's version table is `document_genie.alembic_version` (the server is shared; other schemas have their own).
- Added `CHECK (balance >= 0)` on credit accounts as a race backstop.
- Python deps pinned by `backend/uv.lock`; Python 3.12 only.

### Known issues and deferred work
- Flex tier returns intermittent `429 Flex processing is temporarily unavailable` (4 of 5 tries in one probe). Default tier is now `default`; if flex is re-enabled, Phase 3 must implement the `FLEX_FALLBACK_TIER` retry.
- Test and e2e runs are slow (about 1 s per DB round trip) because the dev database is the remote VPS Postgres. Production will have the database next to the backend.
- Existing (pre-rebuild) users: handled. `credits.reserve` grants the signup credits lazily, and `scripts/regrant_signup_credits.py` was run once on 2026-11-11 (4 users granted 5 + 25).
- The `STORAGE_FAILED` ingestion code exists but nothing sets it yet (the object is uploaded synchronously before ingestion starts; a failure there is a 503 at upload time with the row removed and the credit refunded).
- n8n API key was rotated by the user (2026-11-11) and `.env.local` updated; `N8N_API_KEY` updated in Coolify for both the production and preview entries via the API (values verified equal to local). **Coolify env changes only take effect on the next deploy** (the var is build-time and runtime); the app has not been redeployed, so the live site may still hold the old key until then.

---

## Phase log

<!--
Template: copy for each phase and fill in every field. Write "none" rather than deleting a field.

### Phase N: <title> (YYYY-MM-DD)

- **Status:** done | partial
- **Commit:** <hash or "not committed">
- **What was built:** files and modules added or changed, at the level someone would need to find them.
- **Exit criteria:** which passed; list any that did not, and why.
- **Deviations from the phase file:** what changed and why.
- **Decisions made:** with reasons (also copy them into "Decisions made during implementation" above).
- **Phase-specific handoff items:** everything listed under "Record in the handoff" in the phase file.
- **How to verify this phase still works:** the exact commands.
- **Open issues / follow-ups:** including anything noticed that belongs to a later phase (name the phase).
- **Notes for the next session:**
-->

### Phase 1: Backend foundation (2026-11-11)

- **Status:** done
- **Commit:** see the status table in README.md
- **What was built:** `backend/` (uv project, Python 3.12): `app/main.py`, `config.py`, `db.py`, `deps.py`, `errors.py`, `routers/health.py`, `services/llm.py`, `models/{documents,chat,billing}.py`, `alembic/` with `versions/0001_initial_schema.py`, `Dockerfile`, `tests/`, `scripts/` (smoke + read-only DB inspect). Root `.gitignore` now ignores `/n8n_workflows/`, backend venv/caches, and un-ignores `.env.example`.
- **Exit criteria:**
  - PASS: error shape `{success,status,message,details}`; missing/invalid `X-Internal-Key` rejected; missing `X-User-Id` rejected on user-scoped routes (20 unit tests).
  - PASS: smoke-test results recorded (below). All four features confirmed.
  - PASS: `n8n_workflows/` gitignored (verified with `git check-ignore`); n8n key rotated by the user and updated in `.env.local` and Coolify (see Known issues for the redeploy caveat).
  - PASS: `alembic upgrade head` applied (user approved the table drops); `alembic current` = `0001 (head)`; all 10 new tables exist, HNSW (cosine) and GIN indexes present, `tsv` is a generated column. Better Auth tables unchanged (user 4, account 4, verification 1, session 0 rows).
  - PASS: `uvicorn app.main:app --port 8765` starts; `GET /v1/health` returned `200 {"success":true,"status":"ok","checks":{"database":"ok"}}` with the key, `401` with no/wrong key.
- **Deviations from the phase file:** none in scope. Added `scripts/` and `/n8n_workflows/` is root-anchored. Docs/openapi disabled on the private app.
- **Decisions made:** see Current state > Decisions.
- **Phase-specific handoff items:**
  - *Smoke test* (model id `gpt-6-luna` for both chat and OCR, `openai` Python SDK, Responses API): `service_tier="flex"` works (response echoes `service_tier: flex`) but intermittently 429s "Flex processing is temporarily unavailable" (4 of 5 tries failed before success); `reasoning={"effort":"medium","summary":"auto"}` accepted on both tiers; reasoning summary text returned on flex for a non-trivial prompt (empty for a trivial one, so UI must handle empty summaries); image input via `{"type":"input_image","image_url":"data:image/png;base64,..."}` worked and OCR'd a test image exactly. SDK parameter names matched the plan, no differences.
  - *Commands:* see Current state > How to run locally.
  - *Env var names:* see Current state > Env vars.
  - *pgvector:* the extension already exists on the server (schema `public`, v0.8.1). The migration also runs `CREATE EXTENSION IF NOT EXISTS vector` (no-op here). Search path includes `public` so `vector` operators resolve.
  - *Alembic head:* `0001`, applied.
  - *Service tier:* default changed to `default` after the smoke test (see Decisions).
  - *Errors/auth:* `app.errors.ApiError` / `ErrorCode`; `app.deps.CurrentUserId` / `current_user_id` / `verify_internal_key`.
  - *n8n key / gitignore:* key rotated; `n8n_workflows/` gitignored.
- **How to verify this phase still works:** from `backend/`: `uv run pytest -q`; `uv run alembic current` (expect `0001`); `uv run uvicorn app.main:app --port 8765` then `curl -H "X-Internal-Key: <value from backend/.env>" localhost:8765/v1/health`.
- **Open issues / follow-ups:** redeploy Coolify later so it picks up the rotated key (Phase 11 or sooner); fill `PRICING` (Phase 3 cost logging); flex fallback (Phase 3); credit-account backfill (Phase 2); storage check in health (Phase 2). The DB is the shared VPS Postgres (many other apps' schemas); any future DB-affecting command should stay schema-qualified to `document_genie`.
- **Notes for the next session:** Phase 2 may start; `alembic current` is `0001` and health is green. Use a free port (8000 is taken locally).

### Phase 2: Credits, storage and document ingestion (2026-11-11)

- **Status:** done
- **Commit:** 7f06637
- **What was built:**
  - `docker-compose.dev.yml` (MinIO plus a bucket-creation job).
  - `backend/app/services/`: `storage.py`, `credits.py`, `parsing.py`, `ocr.py`, `chunking.py`, `embeddings.py`, `usage.py`, `ingestion.py`, plus two helpers not in the plan's file list: `uploads.py` (streaming multipart receiver with the byte cap) and `documents.py` (transactional create, ownership lookup, delete).
  - `backend/app/routers/documents.py`, `routers/credits.py`; `schemas/documents.py`, `schemas/credits.py`.
  - Changed: `main.py` (routers, stale-document sweep task in the lifespan), `routers/health.py` (storage check), `db.py` (`get_sessionmaker`), `errors.py` (`STORAGE_UNAVAILABLE`, `IngestionErrorCode`, `IngestionError`), `config.py` (ingestion tunables, embedding price), `pyproject.toml` (boto3, pypdf, python-docx, pypdfium2, pillow, dev: reportlab; pytest loop scope is now `session`; a ruff bugbear setting for FastAPI `Depends`).
  - `backend/scripts/regrant_signup_credits.py`, `scripts/e2e_ingest.py`.
  - Tests: `tests/test_parsing_chunking.py` (20, no infra), `tests/test_credits.py` (10), `tests/test_documents.py` (27), `tests/factories.py`, and a rewritten `tests/conftest.py` (throwaway schema, MinIO bucket, fake OpenAI). No Alembic migration: the Phase 1 schema already had everything.
- **Exit criteria:**
  - PASS: MinIO runs from `docker-compose.dev.yml`; `GET /v1/health` returned `{"database":"ok","storage":"ok"}` against the running server.
  - PASS: a text PDF, a scanned PDF (OCR, `ocr_used=true`), a DOCX and a CSV each reached `ready` with chunks and embeddings through a running server using the real OpenAI API (`scripts/e2e_ingest.py`: chunks 3/1/7/3, every chunk embedded, 31 CSV rows, originals stream back, about 3 to 5 s each). `llm_usage` rows were written for `embedding` (cost computed) and `ocr` (cost NULL, no `gpt-6-luna` price yet).
  - PASS: all tests (77: 40 unit, 10 credits, 27 documents), each plan test item covered: concurrency no double spend (reservations and uploads), 0 credits rejected, refund on failure, duplicate 409, size/page/row limits, type sniffing (CSV sent as `application/vnd.ms-excel` accepted, renamed binary rejected), scanned PDF OCR (faked model, real page rendering), cross-user denial on get/content/delete/list, delete removes object + chunks + rows, signup grant idempotent (also under concurrency).
- **Deviations from the phase file:**
  - Added `uploads.py` and `documents.py` helper modules (the plan listed no files for them).
  - OCR runs when a PDF's text averages fewer than 25 characters per page, over all pages (not page by page).
  - DOCX and TXT have no real page layout: TXT is split into 500-word virtual pages and DOCX paragraphs are spread across `num_pages` in proportion to length, so citation page numbers for those types are approximate.
  - Tests fake the OpenAI client for embeddings and the OCR transcription call (free, deterministic); the real API is covered by `scripts/e2e_ingest.py` instead of pytest.
  - MinIO image is `pgsty/minio` and the host ports are 9100/9101 (see Decisions).
- **Decisions made:** see Current state > Decisions (credits assumption confirmed, failed re-upload, delete-while-processing, age-based sweep, MinIO image/ports, test schema).
- **Phase-specific handoff items:**
  - *MinIO:* API 9100, console 9101, bucket `docgenie` (and `docgenie-test` for pytest), start with `docker compose -f docker-compose.dev.yml up -d`; env names `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` (values in `backend/.env`).
  - *Public functions of `credits.py` / `storage.py`:* listed in Current state > Contracts.
  - *Ingestion `error_code` values:* `NO_TEXT_FOUND`, `PARSE_FAILED`, `OCR_FAILED`, `EMBEDDING_FAILED`, `TEXT_TOO_LARGE`, `PROCESSING_INTERRUPTED`, `INTERNAL_ERROR` (and the unused `STORAGE_FAILED`). Phase 8 maps them to readable messages. Upload-time errors are HTTP codes (see the endpoint table).
  - *Response shapes:* `backend/app/schemas/documents.py` (`DocumentOut`, `DocumentListOut`), summarised in Current state > HTTP endpoints.
  - *Test setup:* `tests/conftest.py` sets `DB_SCHEMA=docgenie_test_<random>` before the app imports, creates it with `Base.metadata.create_all` on the `DATABASE_URL` database, and drops it at the end; MinIO bucket `docgenie-test` is emptied at the end. Command: `uv run pytest -q` from `backend/` (MinIO container must be up).
  - *Re-grant script:* `backend/scripts/regrant_signup_credits.py`, run once on 2026-11-11: 4 existing users granted 5 + 25; a second run granted 0.
  - *Credits assumption:* confirmed by the user (5 + 25, 1 per upload and per turn).
- **How to verify this phase still works:** `docker compose -f docker-compose.dev.yml up -d` (repo root); from `backend/`: `uv run pytest -q` (about 4 min); `uv run uvicorn app.main:app --port 8765`, then `curl -H "X-Internal-Key: <value from backend/.env>" localhost:8765/v1/health` (expect database and storage `ok`); optionally `PYTHONPATH=. uv run python scripts/e2e_ingest.py http://localhost:8765` (real OpenAI, a few cents).
- **Open issues / follow-ups:**
  - Phase 3: fill `PRICING` for `gpt-6-luna` (OCR cost is NULL until then); retrieval should query `document_chunks` filtered by `user_id` and `document_id`; for CSV documents the aggregate/SQL tool reads `document_rows` (`row_data` values are all strings, `csv_schema.columns[].type` says how to cast).
  - Phase 4: account deletion must call `storage.delete_prefix(storage.user_prefix(user_id))` and delete credit/usage rows by `user_id`; the dashboard endpoint needs balances (`credits.get_balances`).
  - Phase 5: the Next.js upload proxy must forward the multipart body without setting `Content-Type`, and the Better Auth hook calls `POST /v1/users/{id}/signup-credits`. The frontend must poll `GET /v1/documents/{id}` while `processing`.
  - Phase 8: map the ingestion error codes above to readable messages.
  - Phase 11: a production bucket and `S3_*` values come from the Coolify MinIO service (`add-minio-storage-to-coolify`), and the container is single-process, so the in-process background tasks are fine; if it ever runs several workers the sweep still works because it is age-based and race-safe.
  - A one-line status of the old `bytea` data: nothing migrated, by plan.
- **Notes for the next session:** Phase 3 can start. Start the MinIO container first if you want to run the whole test suite. Chunks already carry `page_start` / `page_end` for citations (null for CSV). Embeddings are `text-embedding-3-small` at 1536 dimensions.


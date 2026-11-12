# DocGenie rebuild: progress and handoff log

Read the protocol in [README.md](README.md) first. This file has two parts:

1. **Current state:** always up to date. Each session rewrites it at the end so it matches the repo at that point.
2. **Phase log:** one entry per finished (or partial) phase, appended in order and never rewritten afterwards.

No secrets anywhere in this file: record env var names and where their values live.

---

## Current state

_Last updated by: Phase 11 (done; the rebuild is complete)_

### Production (Phase 11, 2026-11-12)
All on the Hostinger VPS under Coolify, project **DocGenie** (`ljgyzo9d1hke7w07v92hu5tc`), environment `production`, server `localhost` (`j1234smx72kcb6aeovlaa9f7`). No secrets here.

| Piece | Coolify name | UUID | Reached at |
|---|---|---|---|
| Frontend | app `docgenie` | `j113egdv0pd7pdg1da10rrcw` | https://docgenie.zeeshanai.cloud (public) |
| Backend | app `docgenie-api` | `re1atproolkc1rr443c2c6jg` | `http://docgenie-api:8000` (network alias on the shared `coolify` network; **no domain, no published port**) |
| MinIO | service `docgenie-minio` | `3meryolonukwsbxbmokentg2` | `http://minio-3meryolonukwsbxbmokentg2:9000` (container name; the backend's `S3_ENDPOINT`), bucket `docgenie`, bucket-scoped user with policy `docgenie-rw` |

- Frontend env added: `BACKEND_API_URL=http://docgenie-api:8000` and `INTERNAL_API_KEY` (a **new production key**, different from the one in the local `backend/.env`), both runtime-only. The nine dead `N8N_*` vars were deleted (production and preview entries); `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_CONTACT_FORM_WEBHOOK_ID` remain.
- Backend env (all runtime-only, set in Coolify, unquoted): `DATABASE_URL` (same Postgres as Better Auth and local development), `OPENAI_API_KEY`, `INTERNAL_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=us-east-1`. Everything else uses the defaults in `config.py`.
- Backend app settings: build pack dockerfile, base directory `/backend`, branch `main`, port 8000, health check **disabled in Coolify** (the Dockerfile `HEALTHCHECK` is used; container reports `healthy`).
- Backend deploys: `.github/workflows/deploy-backend.yml` triggers a Coolify deploy of `re1atproolkc1rr443c2c6jg` when a push to `main` touches `backend/**` (or by hand: Actions > Run workflow). The container runs `alembic upgrade head` before uvicorn (see `backend/Dockerfile`); a failing migration exits the container, so Coolify keeps the previous one. Added after Phase 11 (2026-11-12).
- Production health check: `GET /v1/health` with the key returns `{"database":"ok","storage":"ok"}`; without the key it is 401.
- Backup taken before anything else: `/root/backups/docgenie-document_genie-pre-phase11-20261112T065758Z.sql` on the VPS (`pg_dump -n document_genie`, 14 tables).

### How to run locally
- Docs: the root [README.md](../../README.md) (local setup, env tables) and [CLAUDE.md](../../CLAUDE.md) (architecture and rules for Claude sessions) were rewritten in Phase 10 and describe the rebuilt system. `backend/.env.example` and the root `.env.example` match `config.py` and `src/lib/backend.ts` (checked by script in Phase 10).
- Frontend: `npm run dev` (localhost:3000). Production-mode check: stop the dev server (both use `.next`), `npm run build`, `npx next start -p 3001`. Needs the backend running and `BACKEND_API_URL` + `INTERNAL_API_KEY` in root `.env.local` (Phase 5). Full local stack = MinIO container + `uv run uvicorn app.main:app --port 8765` + `npm run dev`.
- MinIO (from the repo root): `docker compose --env-file backend/.env -f docker-compose.dev.yml up -d` (starts container `docgenie-dev-minio` and a one-shot job that creates the private buckets `docgenie` and `docgenie-test`; the root credentials and bucket name are read from the `S3_*` values in `backend/.env`, so the app and MinIO cannot drift; same layout as the ResuMatch / DocuMind dev setups). Stop with `docker compose -f docker-compose.dev.yml down` (data stays in the `docgenie-minio-data` volume). Production MinIO is a dedicated Coolify service, provisioned in Phase 11 like ResuMatch (`resumatch-minio`: no public domain, `coolify` network, bucket-scoped user).
- Backend (from `backend/`):
  - install: `uv sync`
  - run: `uv run uvicorn app.main:app --port 8765`
  - migrate: `uv run alembic upgrade head` (head `0003`: `0002` allowed the `incomplete` chat message status; `0003` dropped the unused `contact_submissions` table; both applied to the shared database on 2026-11-12)
  - NOTE: port 8000 on the dev machine is occupied by an unrelated process; use `--port 8765` (or any free port)
  - tests: `uv run pytest -q` (**193 passed, 13 min 16 s on 2026-11-12**). Needs the MinIO container above and `DATABASE_URL` in `backend/.env`. Slow because the DB is the remote VPS (about 1 s per round trip); the 40 unit tests alone (`uv run pytest tests/test_parsing_chunking.py tests/test_auth_and_errors.py tests/test_config.py -q`) take under a second. If the DB or MinIO is unreachable the integration tests skip instead of failing.
  - real end-to-end ingestion check (real OpenAI; start the server first): `PYTHONPATH=. uv run python scripts/e2e_ingest.py http://localhost:8765`. It cleans up after itself.
  - real end-to-end chat check (real OpenAI, a few cents; start the server first): `PYTHONPATH=. uv run python scripts/e2e_chat.py http://localhost:8765`. Uploads a PDF and a CSV as a throwaway user, chats three times over real SSE (PDF question, CSV question, a harder one that triggers reasoning), checks events/citations/metrics/title/credits, cleans up.
  - stop a dev server on Windows: `Get-NetTCPConnection -LocalPort 8765 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }` (PowerShell)
  - re-grant signup credits to existing Better Auth users (idempotent): `PYTHONPATH=. uv run python scripts/regrant_signup_credits.py [--dry-run]`
  - model smoke test: `PYTHONPATH=. uv run python scripts/smoke_models.py` (and `scripts/smoke_flex_probe.py`)
  - read-only DB inspection: `PYTHONPATH=. uv run python scripts/inspect_db.py [table ...]`

### Services and ports
| Service | Port | Notes |
|---|---|---|
| Next.js dev | 3000 | |
| FastAPI backend | 8765 locally (8000 is taken on the dev machine; `BACKEND_API_URL=http://localhost:8765`) | private; every `/v1` route needs `X-Internal-Key`; only the Next.js server calls it |
| MinIO API | 9100 | `S3_ENDPOINT=http://localhost:9100`, bucket `docgenie` (private). Not 9000: another local project's MinIO already holds 9000/9001 |
| MinIO console | 9101 | login = `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from `backend/.env` |

### Env vars (names only)
| Var | Used by | Where the value lives | Added in phase |
|---|---|---|---|
| _existing vars are listed in `CLAUDE.md`_ | | | |
| `DATABASE_URL`, `OPENAI_API_KEY`, `INTERNAL_API_KEY` | backend | `backend/.env` (gitignored; seeded from root `.env.local`, `INTERNAL_API_KEY` generated) | 1 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | backend + `docker-compose.dev.yml` (via `--env-file backend/.env`) | `backend/.env` (set to the local MinIO in Phase 2) | 1 (set in 2) |
| ~~`CONTACT_NOTIFY_EMAIL`, backend `RESEND_API_KEY`~~ | | **Removed in Phase 4**: the contact form stays on n8n, so the backend sends no email. Resend is used only by Next.js (auth OTP). A leftover `RESEND_API_KEY` line in `backend/.env` is ignored | 1, removed 4 |
| Dashboard tunables: `DASHBOARD_RECENT_LIMIT` (5), `DASHBOARD_ACTIVITY_LIMIT` (10), `DASHBOARD_USAGE_DAYS` (14) | backend | defaults in `backend/app/config.py` | 4 |
| `TEST_S3_BUCKET` (optional) | pytest | overrides the test bucket (default `docgenie-test`); the suite also forces `DB_SCHEMA=docgenie_test_<random>` | 2 |
| All tunables (`CHAT_MODEL`, `MAX_UPLOAD_MB`, `CHUNK_SIZE`, ...) | backend | defaults in `backend/app/config.py`; list in `backend/.env.example` | 1 |
| Chat/agent tunables: `AGENT_MAX_STEPS` (8), `HISTORY_WINDOW` (20), `RETRIEVAL_TOP_K` (8), `RETRIEVAL_CANDIDATES` (30), `RRF_K` (60), `SNIPPET_CHARS` (240), `CITATION_FOCUS_CHARS` (360), `DOC_TEXT_MAX_TOKENS` (25000), `QUERY_MAX_ROWS` (100), `QUERY_TIMEOUT_MS` (5000), `TOOL_RESULT_MAX_CHARS` (24000), `TITLE_MAX_CHARS` (60) | backend | defaults in `backend/app/config.py` | 3 |
| `LLM_INPUT_PRICE_PER_M`, `LLM_OUTPUT_PRICE_PER_M` (USD per 1M tokens for `gpt-6-luna`), `FLEX_PRICE_MULTIPLIER` (0.5) | backend | **not set**: no price is known to this repo, so `llm_usage.cost_usd` is `NULL` for chat/title/OCR until the user supplies them in `backend/.env` | 3 |
| Ingestion tunables: `OCR_MIN_CHARS_PER_PAGE` (25), `OCR_REASONING_EFFORT` (low), `OCR_RENDER_SCALE` (2.0), `OCR_CONCURRENCY` (4), `EMBEDDING_BATCH_SIZE` (64), `CSV_ROWS_PER_CHUNK_CHARS` (1500), `INGESTION_STALE_MINUTES` (10), `INGESTION_SWEEP_INTERVAL_S` (300) | backend | defaults in `backend/app/config.py` | 2 |
| `INTERNAL_API_KEY` (same value as the backend's) | Next.js server (`src/lib/backend.ts`) | root `.env.local`, copied from `backend/.env` | 5 |
| `BACKEND_API_URL` (no trailing slash) | Next.js server | root `.env.local` (`http://localhost:8765` locally) | 5 |
| ~~`N8N_INGESTION_WEBHOOK_ID`, `N8N_AI_ASSISTANT_WEBHOOK_ID`, `N8N_TITLE_GENERATOR_WEBHOOK_ID`, `N8N_ANALYTICS_WEBHOOK_ID`, `N8N_CREDITS_WEBHOOK_ID`, `N8N_DATA_WEBHOOK_ID`, `N8N_DELETE_WEBHOOK_ID`, `N8N_PREVIEW_DOCUMENTS_WEBHOOK_ID`, `N8N_ADD_REACTION_WEBHOOK_ID`~~ | | **Removed in Phase 5** from `.env.local` and `.env.example`. Still set in Coolify: remove them there in Phase 11 | 5 |
| `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_CONTACT_FORM_WEBHOOK_ID` | Next.js (contact route only) | kept: the contact form stays on n8n | |

### Contracts later phases rely on
- **Raising errors:** `from app.errors import ApiError, ErrorCode`; `raise ApiError(ErrorCode.INSUFFICIENT_CREDITS)` (optional `message=`, `details=`). Body is `{success:false, status:<CODE>, message, details}`. Codes and HTTP map: `backend/app/errors.py`.
- **Auth deps:** `verify_internal_key` is applied to the whole `/v1` router in `app/main.py`. User-scoped routes take `user_id: CurrentUserId` (`from app.deps import CurrentUserId`; `current_user_id` is the underlying dependency). New routers are added via `v1.include_router(...)` in `create_app()`.
- **DB:** `app.db.get_session` (FastAPI dependency, AsyncSession), `Base` (metadata schema `document_genie`). Models in `backend/app/models/`. Search path is `document_genie,public`.
- **LLM:** `app.services.llm.respond(...)` is a thin non-streaming Responses wrapper; `app.services.llm.get_client()` returns the shared `AsyncOpenAI`; `llm.stream_response(...)` is the streaming call the agent uses (stateless `store=False`, encrypted reasoning items replayed, flex to `FLEX_FALLBACK_TIER` retry); `llm.generate_text(...)` is the one-shot call used for titles. Cost: `PRICING` in `app/config.py` has the embedding price; chat/title/OCR cost comes from `LLM_INPUT_PRICE_PER_M` / `LLM_OUTPUT_PRICE_PER_M` (unset, so `cost_usd` is `NULL`; see Known issues).
- **Chat stream (Phase 5 proxies it, Phase 7 consumes it):** the exact SSE contract, with one real example per event, is in [backend/docs/chat-stream.md](../../backend/docs/chat-stream.md). Build the adapter from that file.
- **System prompt:** `backend/app/prompts.py` (`SYSTEM_PROMPT`, `SELECTION_NOTE`, `TITLE_PROMPT`).
- **Chat internals (for debugging):** `services/chat.py` (`prepare_turn` = session upsert + history + credit + user message in one transaction; `stream_turn` = SSE frames and persistence; `generate_title`; `drain_background()` waits for detached persistence tasks), `services/agent.py` (`run_agent`, `AgentStats`, `Accumulator` builds `parts`), `services/tools.py` (`TOOL_DEFINITIONS`, `run_tool`, `ToolContext` with the numbered citation `sources`), `services/retrieval.py` (`search_chunks`, `Hit`), `services/sql_guard.py` (`validate_query`, `run_query`, `rows_columns`).
- **`query_table` SQL rules** (`sql_guard.py`): exactly one `SELECT` over a relation called `rows` (unqualified); columns are the CSV headers plus `row_num`; `integer`/`number` columns are cast safely (non-numeric cells become NULL). Rejected: any other statement type, multiple statements, `WITH`, `UNION`/`INTERSECT`/`EXCEPT`, `INTO`, `FOR UPDATE`, placeholders, any other table or a schema-qualified name, set-returning/table functions in `FROM`, and every function not on `ALLOWED_FUNCTIONS` (aggregates, `ROUND/ABS/...`, string functions, `COALESCE/NULLIF/CAST`, `DATE_TRUNC/EXTRACT`, window functions, regex match). Executed SQL is regenerated from the validated AST, run in a `READ ONLY` transaction with `statement_timeout`, wrapped in a hard row cap. Known limits: sqlglot's Postgres dialect decides what parses (exotic Postgres syntax is rejected, not run); `TABLESAMPLE` on `rows` is accepted (harmless); there are no CTEs, so multi-step SQL must use subqueries.
- **Credits (`app/services/credits.py`)**: all functions work in the caller's transaction and never commit. `UnitType = "document" | "message"`.
  - `reserve(session, user_id, unit_type, *, amount=1, reference_id=None, file_name=None, description=None) -> None`: atomic conditional UPDATE plus a `usage` ledger row; raises `ApiError(INSUFFICIENT_CREDITS)` (402). A user with no account row gets the signup grant lazily, then the reservation is retried.
  - `refund(session, user_id, unit_type, *, amount=1, reference_id=None, file_name=None, description=None) -> bool`: balance + ledger `refund` row; idempotent per `(reference_id, unit_type)` (returns False if already refunded). Phase 3 must pass the message id as `reference_id`.
  - `grant_signup(session, user_id) -> bool`, `get_balances(session, user_id) -> Balances | None` (`.credit_balance`, `.message_balance`), `list_transactions(session, user_id, *, limit=50, offset=0) -> list[dict]`.
  - The balances are `credit_accounts.credit_balance` (documents) and `message_balance` (chat turns).
- **Storage (`app/services/storage.py`, boto3 in threads, all coroutines)**: `object_key(user_id, document_id, file_name) -> str` (`users/{user_id}/{document_id}/{safe name}`), `user_prefix(user_id) -> "users/{user_id}/"`, `safe_file_name(name)`, `put_file(key, path, content_type)`, `put_bytes(key, data, content_type=...)`, `open_object(key) -> StoredObject(body, content_length, content_type)` + `iter_object(obj)` (async chunk iterator), `read_bytes(key)`, `object_exists(key)`, `delete_object(key)`, `list_keys(prefix) -> list[str]`, `delete_prefix(prefix) -> int` (Phase 4 account deletion: `delete_prefix(user_prefix(uid))`), `ensure_bucket()`, `check_storage() -> bool`. All raise `storage.StorageError` on failure.
- **Usage (`app/services/usage.py`)**: `log_usage(session, *, user_id, kind, model, usage: Usage, service_tier="default", session_id=None)` adds an `llm_usage` row to the caller's transaction (kinds `chat|title|ocr|embedding`); `usage_from_response(resp) -> Usage`; `compute_cost(model, tier, usage)`.
- **Dashboard (`app/services/dashboard.py`, `app/schemas/dashboard.py`)**: `build_dashboard(session, user_id) -> DashboardOut`. Five queries (one aggregate for balances and counts). Usage is derived from the credit ledger, net of refunds. **Strictly read-only**: a user with no credit account shows balances 0 / 0 and nothing is created (an earlier version granted signup credits here, which re-created an account after deletion; fixed 2026-11-12). Accounts come from the signup hook (`POST /v1/users/{id}/signup-credits`, Phase 5) and, as a safety net, from `credits.reserve` on first use.
- **Account (`app/services/account.py`)**: `build_export(session, user_id) -> ExportFile` (zip in an anonymous temp file), `delete_account(session, user_id) -> DeletionResult`, `ACCOUNT_TABLES` (every model with a `user_id` column; a test fails if a new table is missing from it, so add new tables there). `storage.ObjectNotFound` (a `StorageError` subclass) distinguishes a missing key from an outage.
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
| `POST /chat/stream` | SSE, see [chat-stream.md](../../backend/docs/chat-stream.md). Body `{session_id, message, document_ids?}`. `402` before streaming if the message balance is 0 |
| `GET /sessions` | `{sessions: [SessionOut]}`, most recently active first. `SessionOut` = `{id, title, document_ids (null = all documents), created_at, updated_at}` |
| `GET /sessions/{id}/messages` | `{messages: [MessageOut]}`, oldest first. `MessageOut` = `{id, role, content, parts, metrics, status (complete\|incomplete\|error), model, created_at, feedback}`; `parts` is the ordered `reasoning\|tool\|text\|citation\|error` list and `metrics` the object from `message.end` (both described in chat-stream.md); `feedback` is `null` or `{message_id, rating, reason, comment}` |
| `PATCH /sessions/{id}` | body `{title?, document_ids?}`, only sent fields change; `document_ids: null` or `[]` = all documents. Returns `SessionOut` |
| `DELETE /sessions/{id}` | `204`; messages and feedback cascade |
| `PUT /messages/{id}/feedback` | body `{rating: like\|dislike, reason?, comment?}`; replaces earlier feedback; returns `{message_id, rating, reason, comment}`. Only assistant messages (`422` otherwise) |
| `DELETE /messages/{id}/feedback` | `204`, idempotent |
| `GET /dashboard` | Phase 4. Read-only (no credit account = balances 0 / 0, nothing created). Shape below ("Dashboard response") |
| `GET /account/export` | Phase 4. `200 application/zip`, `Content-Disposition: attachment; filename="docgenie-export-YYYY-MM-DD.zip"`, `Content-Length` set. Layout below. `503 STORAGE_UNAVAILABLE` if storage is unreachable (never a silently partial export) |
| `DELETE /account` | Phase 4. `200 {deleted: {documents, sessions, storage_objects}}`. Idempotent. `503 STORAGE_UNAVAILABLE` if the object cleanup failed (rows are already gone; call again). Order below |

**Dashboard response** (`GET /v1/dashboard`; `app/schemas/dashboard.py`):
```
{
  "balances": {"documents": 3, "messages": 23},
  "counts": {"documents": 3, "documents_ready": 2, "documents_processing": 0, "documents_failed": 1,
             "sessions": 2, "user_messages": 2},
  "recent_sessions":  [{"id", "title" (null until titled), "updated_at"}],            // titles only, newest activity first, max 5
  "recent_documents": [{"id", "file_name", "status", "error_code", "created_at"}],     // newest first, max 5
  "recent_activity":  [{"kind": "signup|usage|refund", "unit_type": "document|message",
                        "amount_delta", "file_name", "description", "created_at"}],  // credit ledger, newest first, max 10
  "usage": {"documents_spent": 2, "messages_spent": 2,                                 // lifetime, net of refunds
            "daily": [{"date": "2026-11-12", "documents": 2, "messages": 2}, ...]}     // 14 UTC days, oldest first, zero-filled, today last
}
```
No message bodies, no file bytes, about 2 KB.

**Export zip layout** (`GET /v1/account/export`): `account.json` (`user_id`, `exported_at`, `balances` or null, `missing_files` = ids of documents whose stored original was gone), `documents.json` (metadata; no `storage_key`, `checksum` or embeddings; each entry has `file` = its path in the zip or null), `sessions.json`, `messages.json` (with `parts` and `metrics`), `feedback.json`, `credit_transactions.json`, and the originals at `files/{document_id}/{file name}`. `user_id` is left out of every row (it is in `account.json`).

**Account deletion order** (`DELETE /v1/account`): (1) in ONE transaction, delete the user's rows from `message_feedback`, `chat_messages`, `chat_sessions`, `document_rows`, `document_chunks`, `documents`, `credit_transactions`, `credit_accounts`, `llm_usage`; (2) delete every MinIO object under `users/{user_id}/`. Rows go first so that nothing references the files once it commits; if step 2 fails the response is 503 and calling again finishes the cleanup. **Next.js then deletes the Better Auth user (`user`, `account`, `session`, `verification` rows) only after a 200.** A dashboard call for the deleted user afterwards recreates nothing (it shows 0 / 0).

Another user's session, message or document is always `404 NOT_FOUND`, never `403`.

`DocumentOut` = `{id, file_name, mime_type, file_size, num_pages (null for CSV), status: processing|ready|failed, error_code, ocr_used, csv_schema, created_at}`. `storage_key` and `checksum` are never returned. A document of another user is a `404 NOT_FOUND`, not a 403.

### Frontend contracts (Phase 5)

**Route map** (browser path under `src/app/api/` -> backend path; every route resolves the session with `getUserId()`, answers `401 {success:false,status:"UNAUTHORIZED"}` without one, and sends the user only in the `X-User-Id` header):

| Browser | Backend | Notes |
|---|---|---|
| `GET /api/dashboard` | `GET /v1/dashboard` | |
| `GET /api/documents` | `GET /v1/documents` | |
| `POST /api/documents` | `POST /v1/documents` | multipart: `req.formData()` forwarded as `FormData` (no manual Content-Type); early 413 if `Content-Length` is over the limit + 1 MB |
| `GET /api/documents/{id}` | `GET /v1/documents/{id}` | polled while `processing` |
| `DELETE /api/documents/{id}` | `DELETE /v1/documents/{id}` | |
| `GET /api/documents/{id}/content[?download=true]` | same | streamed; `Content-Type`, `Content-Disposition`, `Content-Length` passed through |
| `POST /api/chat` | `POST /v1/chat/stream` | SSE piped through unchanged with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`; `req.signal` is forwarded so a closed tab cancels the backend run. Pre-stream errors (402/404/422) come back as plain JSON |
| `GET /api/sessions` | `GET /v1/sessions` | |
| `PATCH` / `DELETE /api/sessions/{id}` | same | |
| `GET /api/sessions/{id}/messages` | `GET /v1/sessions/{id}/messages` | |
| `PUT` / `DELETE /api/messages/{id}/feedback` | same | |
| `GET /api/credits/history[?limit&offset]` | `GET /v1/credits/history` | only `limit` and `offset` are forwarded |
| `GET /api/account/export` | `GET /v1/account/export` | zip streamed with `Content-Disposition: attachment` |
| `DELETE /api/account` body `{password?}` | `DELETE /v1/account` via Better Auth | see Account deletion below |
| `POST /api/contact` | n8n webhook (unchanged) | honeypot, Upstash limit, no-JS 303 |
| `/api/auth/*` | Better Auth | unchanged |

**Removed routes:** `analytics`, `credits/balance`, `documents/list`, `chat/history`, `chat/title` (unused), and `user-data`, `documents/upload`, `documents/delete`, `documents/preview`, `chat/message`, `chat/reaction`, `chat/session-history` (replaced by the routes above). Chat titles now come from the stream's `session.title` event.

**`src/lib/backend.ts` (server-only; never import it from a client component):**
- `backendFetch(path, {userId?, method?, headers?, body?, signal?, timeoutMs?})`: raw `Response` for any status; adds `X-Internal-Key` (and `X-User-Id` when `userId` is given); 30 s default timeout.
- `backendStream(path, req)`: same, no timeout; for the SSE stream, downloads and the export zip.
- `backendJson<T>(path, req)`: parsed JSON; throws `BackendHttpError(status, body)` on non-2xx. All of them throw `BackendUnavailableError` if the backend cannot be reached or `BACKEND_API_URL` / `INTERNAL_API_KEY` is unset.
- Route helpers: `forward(path, {...req, stream?})` (call + relay; nearly every route is one line of it), `toClientResponse(res)`, `jsonBodyOf(req)`, `errorResponse(status, code, message)`, `unauthorized()`, `unavailableResponse(err)`. A backend `401` is relayed as `502 BACKEND_AUTH_FAILED` (it means a wrong internal key, not a signed-out user); an unreachable backend is `502 BACKEND_UNAVAILABLE`; a timeout is `504 BACKEND_TIMEOUT`.
- Types are in `src/types/api.ts` (documents, dashboard, sessions, messages and `parts`, feedback, credits, `Citation`, the `ChatStreamEvent` union, `ApiErrorBody`). `src/lib/sse.ts` has `readChatStream(res)`, an async generator of typed events that Phase 7's adapter can reuse.

**`DashboardDataProvider` (`src/contexts/dashboard-data.tsx`) exposes:** `dashboard` (the full `DashboardOut`), `documents` (`DocumentOut[]`, no bytes), `creditBalance`, `messageBalance`, `totalDocuments`, `loading` (first load only), `refreshAll()`. Gone: `chatSessions`, `creditHistory`, `previewDocuments`, `loadPreviewDocuments`. `refreshAll()` fetches `/api/dashboard` and `/api/documents` in parallel (the newest request wins). **Polling:** while any document is `processing`, a 2 s timer calls `GET /api/documents/{id}` for each (skipped while the tab is hidden); when any one settles (ready, failed or gone) it runs `refreshAll()`, which also picks up refunds. The timer restarts only when the set of processing ids changes.

**Account deletion:** `DELETE /api/account {password?}` calls `auth.api.deleteUser` (Better Auth `user.deleteUser.enabled`). Better Auth checks the password (or, with no password, that the session is fresh, so Google users must have signed in recently) and then runs `beforeDelete` in `src/lib/auth.ts`, which calls `DELETE /v1/account`. If that fails it throws `503` and the login is untouched (a retry is safe: the backend call is idempotent). Only after it succeeds does Better Auth delete the user, accounts and sessions and clear the cookies (relayed to the browser). Better Auth's own `POST /api/auth/delete-user` goes through the same hook. Verified live: wrong password = 400 and nothing removed; right password = backend rows 0, MinIO prefix gone, `user` row gone, old cookie 401. **Nothing may call the backend for that user afterwards.**

**Signup credits:** `databaseHooks.user.create.after` in `src/lib/auth.ts` calls `POST /v1/users/{id}/signup-credits` (no `X-User-Id`); errors are logged and swallowed (the backend also grants lazily on first use).

### Design system (Phase 6)

Source of truth: [PRODUCT.md](../../PRODUCT.md) (audience, voice, principles; register `brand`, app surfaces use the product register), [DESIGN.md](../../DESIGN.md) (tokens, type, grid, components, motion, bans) and `DESIGN.json` (sidecar with component snippets), all at the repo root. Tokens live in `src/app/globals.css`.

- **Fonts** (`next/font/google` in `src/app/layout.tsx`): **Schibsted Grotesk** for all words including display (`font-sans`, var `--font-schibsted`), **Spline Sans Mono** for figures and legend labels only (`font-mono`, var `--font-spline-mono`). Geist and DM Serif Display are gone.
- **Colors (OKLCH, light / dark):** accent vermilion `oklch(0.55 0.19 34)` / `oklch(0.69 0.17 36)`; paper `oklch(0.985 0.004 250)` / `oklch(0.17 0.015 255)`; ink `oklch(0.205 0.02 255)` / `oklch(0.95 0.006 250)`; ink soft `oklch(0.48 0.022 255)` / `oklch(0.72 0.02 252)`; hairline rule `oklch(0.895 0.008 250)` / `oklch(0.31 0.016 255)`. Contrast was computed (text at least 4.9:1, ink 17:1) in both themes.
- **Token names components use (Tailwind utilities):** surfaces `bg-background`, `bg-card`, `bg-muted`, `bg-accent` (NOTE: shadcn `accent` is a neutral hover wash, not the brand); text `text-foreground`, `text-muted-foreground`; **brand** `bg-brand`, `text-brand`, `text-brand-foreground`, `bg-brand-hover`, `bg-brand-subtle` (`primary` is an alias, so stock shadcn `bg-primary` is vermilion); lines `border-border` / `border-rule`, `border-rule-strong`, `border-input` (control edge); `ring-ring`; `bg-overlay`; status `text-destructive` / `bg-destructive` + `text-destructive-foreground`, `text-success`, `text-warning`; charts `chart-1..5`.
- **Type scale utilities:** `text-display`, `text-section`, `text-headline`, `text-title`, `text-body`, `text-body-sm`, `text-caption`, `text-label` (each carries its line height). Helpers (`@utility`): `figure` (mono tabular figures), `ds-label` (legend caption), `page-container`, `page-grid` (4 / 12 columns), `measure` (68ch).
- **Radii** are 2 to 6px (`rounded-xs` ... `rounded-lg`); `shadow-2xs/xs/sm` are `none`, only `shadow-md` and `shadow-lg` render (overlays). Default transition is 150 ms ease-out-quart.
- **Motion:** `motion` 14.12 installed. `src/lib/motion.ts` (easing, durations, a `reveal` preset), `src/components/motion-provider.tsx` (`MotionConfig reducedMotion="user"`, mounted in the root layout). CSS tokens `ease-out-expo` and `ease-out-quart`; a global `prefers-reduced-motion` rule collapses CSS transitions.
- **Read before building a surface:** any UI: DESIGN.md Overview (grid, spacing, motion), Colors (The One Mark Rule), Do's and Don'ts. Chat UI and viewer (7): Typography (figures), Components (citation mark, figure row, panel, tag). App surfaces and shared primitives (8): Components, Elevation, Typography hierarchy. Landing (9): Overview (layout, hero sequence, scroll reveals), Typography (display), Do's and Don'ts.

### Chat UI and document viewer (Phase 7)

Packages: `@assistant-ui/react` 0.15.35 (with `@assistant-ui/core` 0.3.35), `@assistant-ui/react-markdown` 0.14.26, `assistant-stream` 0.3.57 (added explicitly: `createAssistantStream` is imported for the title stream).

**Wiring** (`src/lib/chat/`): `runtime.ts` `useDocGenieRuntime()` = `useRemoteThreadListRuntime({ runtimeHook, adapter })`; the runtime hook calls `useLocalRuntime(createChatAdapter(...), { adapters: { feedback } })`; the thread-list adapter is `thread-list-adapter.ts` plus `unstable_useAdapters` returning the per-thread `history` adapter (`history-adapter.ts`).
- `adapter.ts`: the `ChatModelAdapter` (SSE events to parts, see its header comment). `convert.ts`: `PartsBuilder` (live), `contentFromStored` / `repositoryFromMessages` (reload; `MessageOut[]` to the runtime's repository), `timingFromMetrics`, `readCustom`. `citations.ts`: a citation is a `source` part (`sourceType: "document"`, the page range and snippet in `providerMetadata.docgenie`), `citationFromSource`, `linkCitationMarkers`, `plainMath`. `errors.ts`: `describeChatError` (the error copy per code). `feedback.ts`: the feedback adapter + reason chips. `session-store.ts`: document selection per session / per draft chat, and titles from the stream. `highlight.ts`: snippet location (letters and digits only, longest-prefix fallback).
- **Session ids:** `threadListAdapter.initialize()` returns `crypto.randomUUID()` and makes no request; the chat adapter calls `aui.threadListItem().initialize()` on the first message and sends that id as `session_id`. The backend creates the session on that message.
- **Titles:** the stream's `session.title` arrives after `message.end`. The adapter detaches its request from the runtime's abort signal at `message.end` (the runtime aborts it when the run ends, which silently cut the stream and lost every title) and reads the tail in the background, 20 s cap. `generateTitle` awaits that title (fallback: `GET /api/sessions`).
- **Errors:** the adapter never throws for server errors; it yields `status: {type:"incomplete", reason:"error", error:{code,message}}`. Codes: the backend's (`INSUFFICIENT_CREDITS`, `LLM_BUSY`, `LLM_TIMEOUT`, `LLM_ERROR`, `INTERNAL_ERROR`, `NOT_FOUND`), the proxy's (`BACKEND_UNAVAILABLE`, `BACKEND_TIMEOUT`) and `STREAM_INTERRUPTED` (made in the adapter when the stream ends without `message.end`). `refreshAll()` runs after every settled turn (answer, error or stop), because a credit may have been spent or refunded.
- **Message metadata:** `message.metadata.custom` = `{messageId (server id, used for feedback), userMessageId, createdAt (server time), model, metrics}`; `metadata.timing` is set from the metrics at `message.end`.

**Component map** (`src/components/chat/`): `chat-app.tsx` (default export, the whole screen; layout and mobile sheets), `thread.tsx` (viewport, empty and loading states), `messages.tsx` (`UserMessage`, `AssistantMessage`, sources row, status notice), `answer-markdown.tsx` (`AnswerText`: Markdown with inline `[n]` citation marks), `reasoning-block.tsx`, `tool-trace.tsx`, `citation-mark.tsx` (`CitationMark`, `SourceChip`), `message-footer.tsx` (time, copy, like, dislike, `MetricsRow`), `dislike-popover.tsx`, `chat-error.tsx`, `composer.tsx` (+ stop button, zero-credit banner), `document-picker.tsx`, `thread-list.tsx` (inline rename and delete), `viewer-context.tsx` (`ViewerProvider`, `useViewer`), `document-viewer.tsx`. Also `src/components/ui/popover.tsx` (new).

**Document viewer:** `useViewer().openCitation(citation)` or `openDocument(documentId, fileName, page?)` (inside `ViewerProvider`). It renders `DocumentViewer({ target, onClose })` docked from `lg` up and in a sheet below. PDF: `PdfViewer` (`src/components/dashboard/documents/pdf-viewer.tsx`) props `file: string | Blob` (a same-origin URL such as `/api/documents/{id}/content`, or bytes), `initialPage`, `highlight` (snippet), `focusKey` (bump to jump and re-mark for the same file), `fill`. TXT: scrolled to and marked. CSV: the table (first 200 rows) with the SQL that produced the answer above it. DOCX: cited passage plus a download link.

### App surfaces and auth pages (Phase 8)

**Shell** (`src/app/(dashboard)/layout.tsx`): skip link, a `w-60` sidebar on the second neutral (`bg-sidebar`, hairline right rule), a `h-14` top bar, `<main id="main">` with no padding (each page frames itself). Sidebar = wordmark, nav (`NAV_ITEMS` exported from `components/dashboard/sidebar.tsx`), then the credit block and "Help & Support" (`/contact`). **Credits are shown once, in the sidebar** (`credit-display.tsx`: `CREDITS` legend + Documents / Messages figures; a balance of 0 gets a warning icon and a screen-reader word). Top bar = real breadcrumb (`Dashboard / <page>`), theme toggle, user menu. On mobile the sidebar is a sheet (closes on navigation), which is the only place the credits show there.

**Primitives Phase 9 should reuse** (the shared grid language):
- `components/app/page-shell.tsx`: `PageShell` (the `page-container` frame + vertical padding), `PageHeader` (headline, optional description and actions), `Section` (heavier `border-rule-strong` hairline carries the title; content below on paper).
- `components/app/tag.tsx`: `Tag` (mono caption on a wash, 3px radius) and `StatusTag` (word plus a colored mark: uploading, processing, ready, failed, rejected).
- `components/app/setting-row.tsx`: `SettingRow` (title and explanation left, control right, one hairline above, on the 12-column grid) and `FieldLabel`.
- `components/wordmark.tsx`: `Wordmark` (ruled square mark plus the name, ink only). The navbar and footer should use it instead of the emerald `BookOpen` box.
- `components/auth/auth-shell.tsx`: `AuthShell` (server component; ruled header row with wordmark and theme toggle, then `page-grid`: a statement and a `dl` of real limits on the left from `lg`, the form on the right after one hairline) and `components/auth/auth-ui.tsx` (`AuthHeading`, `authLinkClass`).
- Row patterns used everywhere: `ul` with `divide-y divide-rule border-t border-rule`, 40px-plus rows, figures right-aligned in `figure`; the document list is a container-query (`@container`, `@2xl:`) table so it adapts to its own width when the viewer is docked.
- Helpers: `lib/format.ts` (`formatDay`, `formatDate`, `formatDateTime`, `formatBytes`, `formatDelta` with a real minus sign), `lib/credits.ts` (`ledgerLabel`), `lib/constants.ts` (`SIGNUP_DOCUMENT_CREDITS` / `SIGNUP_MESSAGE_CREDITS`, shown on the auth pages; keep them equal to the backend grant).

**Where the `error_code` to message mapping lives:** `src/lib/document-errors.ts`. `describeIngestionFailure(code)` for a `failed` document (all eight `IngestionErrorCode` values plus a generic fallback; the UI always adds "The credit was refunded", which is true because the backend refunds every ingestion failure). `describeUploadError(code)` for a refused upload (`FILE_TOO_LARGE`, `PAGE_LIMIT_EXCEEDED`, `ROWS_LIMIT_EXCEEDED`, `UNSUPPORTED_TYPE`, `DUPLICATE_DOCUMENT`, `INSUFFICIENT_CREDITS`, `VALIDATION_ERROR`, `STORAGE_UNAVAILABLE`, the proxy's `BACKEND_*` codes, `UNAUTHORIZED`, and a browser-side `NETWORK`). `checkFileLocally()` runs the type, size and empty checks before sending. Both return `{ title, detail }`.

**Documents flow:** `useUploadQueue()` (`components/dashboard/documents/use-upload-queue.ts`) sends files one at a time (multi-select and drop), and calls `refreshAll()` after every attempt. A file in the browser's hands is a row with a status (Uploading, or Rejected with a reason, a Retry for network and service errors, and Dismiss); on a 202 it is dropped and the server's row takes over (Processing, then Ready or Failed with the reason). So every file has exactly one row from the moment it is chosen. `DocumentList` shows pages, size, added date, type tag, an OCR tag when `ocr_used`, CSV row counts, Open (Phase 7's `DocumentViewer` through `ViewerProvider` + the new shared `components/chat/viewer-dock.tsx`), Download, and an inline delete confirmation (no modal). A toast announces a document leaving `processing`.

**Settings:** tabs Profile / Credits / Account, rows on the grid. Account: **Export** fetches `/api/account/export` and saves the blob (filename from `Content-Disposition`; errors are shown inline). **Delete** is an inline panel: type `DELETE`, plus the password when the account has one (`useHasPassword()` reads `authClient.listAccounts()`); `DELETE /api/account`; on success `authClient.signOut()` (errors ignored) then `window.location.assign("/")`, a full navigation so no dashboard request can run for the deleted user. A wrong password is `INVALID_PASSWORD` (inline message, nothing deleted); a Google-only user with a stale session gets `SESSION_EXPIRED` and a "Sign in again" button (to `/sign-in?redirect=/dashboard/settings`); a 502/503/504 says the account is still active.

### Landing, marketing pages and brand (Phase 9)

**Chrome:** `components/marketing/marketing-page.tsx` (`MarketingPage`: skip link, `Navbar`, `<main id="main">`, `Footer`) wraps every public content page (landing, About, Contact, Privacy, Terms, 404). Auth pages still use `AuthShell`. `navbar.tsx` is static (no sticky, blur or shrink), exports `NAV_LINKS` (all anchors are `/#id`), and has an inline mobile menu below `lg` (grid-rows open state, `inert` when closed, closes on Escape / link / route change). `footer.tsx` is one row: wordmark, year, About / Contact / Privacy / Terms. `components/marketing/legal-page.tsx` (`LegalPage`) lays out Privacy and Terms.

**Landing section component map** (`src/app/(marketing)/page.tsx` composes them; all in `components/marketing/landing/`):

| Section (anchor) | Component | File |
|---|---|---|
| Hero | `Hero` (+ client `HeroReplay`) | `sections.tsx`, `hero-replay.tsx` |
| How an answer is made (`#pipeline`) | `PipelineSection` (+ client `Pipeline`, scroll-driven rail) | `sections.tsx`, `pipeline.tsx` |
| What it handles (`#limits`) | `LimitsSection` (format / how read / limit table) | `sections.tsx` |
| Under the hood (`#stack`) | `StackSection` | `sections.tsx` |
| Free preview (`#preview`) | `PreviewSection` | `sections.tsx` |
| Questions (`#faq`) | `FaqSection` (native `<details name="faq">`) | `sections.tsx` |
| Closing CTA | `ClosingSection` | `sections.tsx` |

All copy, figures and both JSON-LD objects live in `landing/content.ts` (`PIPELINE_CONFIG`, `PIPELINE_STEPS`, `FORMAT_ROWS`, `STACK_NOTES`, `PREVIEW_ROWS`, `FAQS`, `softwareApplicationSchema`, `faqSchema`, `SITE_URL`). Shared figures (20 MB, 50 pages, 10,000 CSV rows, OCR threshold 25, 5 + 25 credits) come from `lib/constants.ts`; the retrieval numbers (1,000 / 200 chunks, 30 candidates, RRF k 60, top 8, 8 agent steps, 100 rows, 5 s) are copied from `backend/app/config.py` into `PIPELINE_CONFIG`: **change both together**. `landing/reveal.tsx` is the scroll reveal. `lib/use-reduced-motion.ts` (`useReducedMotionSafe`) is the hydration-safe reduced-motion hook to use when the value changes what renders.

**Hero replay:** built from the real presentational chat components (`ReasoningView`, `ToolTraceRow`, `CitationMark`, `SourceChip`, `MetricsRow`), not an assistant-ui runtime, so the landing bundle has no chat runtime. To allow that, `MetricsRow` moved out of `message-footer.tsx` into `components/chat/metrics-row.tsx` (message-footer imports it). The sequence is a staged timeline in `hero-replay.tsx` (`AT`, `STAGE`): question, reasoning, tool call, tool result, streamed answer, citation and sources, metrics, source excerpt opens. The server render, no-JS, print and reduced motion all show the finished turn; it starts only after mount, in view, with motion allowed. Only opacity and transform animate (the source excerpt opens by `grid-template-rows`). **Recorded data (all verbatim, nothing invented):** one live turn captured on 2026-11-12 against the real backend and `gpt-6-luna`, as a throwaway user (since cleaned up) with the two-page contract PDF from `backend/scripts/e2e_chat.py`. Question: "An invoice reaches the client on 3 March. What is the last day it can be paid?" (chosen so the model produces a reasoning summary; an easier first question, "When does the client have to pay an invoice?", gave none, which the contract allows). Recorded: the reasoning summary, the `search_documents` call and its 1,601 ms result, the streamed answer (`The invoice can be paid through **2 April**, 30 days after ...` with the model's own em dash kept as recorded), the citation (`contract.pdf`, pp.1-2, its real snippet, which the excerpt marks whole like the real viewer) and the metrics (first token 7,350 ms, total 7,619 ms, 29.1 tokens/s, 2,402 in / 175 out). Two real runs were made; this is the one with reasoning. Only the pacing is ours. The capture script lived in the session scratchpad, not the repo.

**Brand assets:** logo source of truth is `src/lib/brand.ts` (`BRAND_HEX`: sRGB values of the paper / ink / vermilion tokens, for places that cannot read CSS variables; `LOGO_MARK` geometry). `components/wordmark.tsx` now exports `LogoMark` and `Wordmark` (ink only). Static `public/logo.svg` (reversed mark; the Organization JSON-LD `logo` points to it). Generated: `src/app/icon.tsx` (32 px) and `apple-icon.tsx` (180 px) draw the mark reversed (paper lines on an ink square); `opengraph-image.tsx` (1200 x 630) is paper, ink, hairlines, one citation mark and the real limits, using the default Satori font (no custom font loaded). `viewport.themeColor` uses `BRAND_HEX.paper` / `paperDark` (`#f8fafd` / `#0b1016`, unchanged values). Root `metadata` title / description / OG / Twitter rewritten without em dashes.

### Decisions made during implementation
- **Phase 11 – fixed network alias `docgenie-api` for the backend** (Coolify `custom_network_aliases`). Coolify container names carry a timestamp that changes on every deploy, so they cannot be used as `BACKEND_API_URL`; the alias is stable. MinIO is addressed by its service container name (`minio-<service uuid>`), which is stable.
- **Phase 11 – the backend's container health check is the Dockerfile `HEALTHCHECK`** (Python, sends `X-Internal-Key`), not a Coolify HTTP check and not `curl` in the image. Coolify uses the image's own check when it finds one; the app shows `running:healthy`. This follows the Phase 10 advice and differs from the phase file's "make sure `curl` is in the image".
- **Phase 11 – the backend was built from a temporary branch `rebuild/fastapi-backend`** pushed from local `main`, so that it could be verified before the push to `main` replaced the live frontend. Afterwards the app was switched to `main` and the branch deleted from GitHub.
- **Phase 11 – a new production `INTERNAL_API_KEY`** was generated for the frontend and backend apps in Coolify instead of reusing the local development key.
- **Phase 11 – the app MinIO user is bucket-scoped** (policy `docgenie-rw`, `s3:*` on `docgenie` only), not the MinIO root key.
- **Phase 11 – `git merge origin/main` (not rebase)** before the push: `origin/main` had one commit this repo lacked (the Coolify deploy workflow now needs POST). A merge keeps the commit hashes recorded in the status table valid.
- **Phase 11 – the GitHub Action was left deploying the frontend only.** Backend auto-deploy was not added (not in the phase file; it would restart the backend on every frontend push). See follow-ups.
- **Phase 10 – the zero-credit check set the balance to 2 in the database, then spent both with real turns** instead of burning 23 real model calls on the same code path. The state reached is the same (balance 0 through real spends); the 402 and the disabled composer were then checked on that real state.
- **Phase 10 – `--shadow-2xs/xs/sm` are `0 0 #0000`, not `none`** (`globals.css`). A literal `none` inside Tailwind v4's composed `box-shadow` voids the whole declaration, which removed the keyboard focus ring from every control carrying `shadow-xs` (outline buttons, inputs, textareas, OTP fields, tabs) since Phase 6. A transparent zero shadow renders identically and keeps the ring. Found by the Phase 10 keyboard audit, not by any earlier phase.
- **Phase 10 – `mark.cite-highlight` uses `var(--foreground)`**, not `color: inherit` (unlayered CSS beat the `text-foreground` class, so the hero excerpt inherited a muted gray at 3.9:1).
- **Phase 10 – pulsing labels pulse a small mark, not the text.** The "Working" label and the live reasoning heading faded their text to half opacity, which dips below text contrast. Now the text is static and a 6 px square beside it pulses.
- **Phase 10 – `IMPLEMENTATION_PLAN.md` (root, describes the old n8n and Clerk build) was kept and marked historical** with a banner, not deleted.
- **Phase 10 – root `.dockerignore` now excludes `n8n_workflows`, `backend` and `docs`** (the exports hold live credentials in pinned data; the backend has its own build context). Phase 11 should not undo this.
- **Phase 9 – the plan counted as the confirmed design brief** (as in Phases 6 and 8): no separate shape interview and no visual mock step (no image generation in this harness).
- **Phase 9 – the hero is a replay of one real recorded turn**, labelled as such with a caption ("A real turn against a two-page sample contract, recorded on 12 November 2026 and sped up ... on the development setup with a remote database"). It uses the real timings even though they are slow (the database is remote), because the plan forbids unverified speed claims and the page now claims none. To refresh it after Phase 11, re-capture a turn and replace the constants at the top of `hero-replay.tsx`.
- **Phase 9 – no pricing section.** Pro and Enterprise are removed; "Free preview" states the honest offer (5 documents, 25 messages, no card, no paid plan). Anchors changed: `#features`, `#how-it-works`, `#pricing` are gone; the new ones are `#pipeline`, `#limits`, `#stack`, `#preview`, `#faq`.
- **Phase 9 – the navbar is static**, not sticky (DESIGN.md: "does not float, blur or shrink on scroll"); the mobile menu is an inline panel, not a sheet.
- **Phase 9 – icons are ink-only** (The One Mark Rule: the accent is not spent on the logo).
- **Phase 9 – legal copy updated to match shipped features:** Privacy and Terms now say account deletion and export are self-service in Settings, deletion is immediate (30 days only for a request through the contact form), credits are refunded on failed uploads and answers, and there is no way to buy more. Terms no longer claim ownership of "AI models" (they are OpenAI's). Both are dated 12 November 2026.
- **Phase 9 – transactional email copy lost its em dashes** (`lib/email.ts`, three strings); nothing else in that file changed.
- **Phase 9 – About has no author name or link** (nothing in the repo says what to publish). See the handoff.

- **Phase 8 – the plan counted as the confirmed design brief** (as in Phase 6): no separate shape interview, and no visual mock step because the harness has no image generation.
- **Phase 8 – one row per file in the document list.** The plan asked the upload to show "a status for each file". Instead of a separate tray plus a list (the same file twice), the list shows browser-side items (Uploading, Rejected) above the server's documents, so there is one table and one status per file.
- **Phase 8 – inline confirmations, no dialogs.** Document delete and account delete are inline panels (DESIGN.md: modal is not a first thought). The preview dialog is gone: Open uses the Phase 7 viewer.
- **Phase 8 – the chat fills the main area.** The dashboard layout no longer pads `main`; the chat is `h-[calc(100dvh-3.5rem)]` without its own border (a Phase 7 file, `chat-app.tsx`, edited for this; its docked viewer / sheet logic moved to `components/chat/viewer-dock.tsx`, which the documents page also uses).
- **Phase 8 – type tokens now carry weight and tracking.** `globals.css` (Phase 6) set sizes and line heights for `text-title` / `headline` / `section` / `display` but not the weights and tracking DESIGN.md specifies, so headings rendered at 400. Added `--text-*--font-weight` and `--text-*--letter-spacing`.
- **Phase 8 – mono only for numbers.** Emails, file names and prose stay in the sans (the mono's wide period and comma looked broken in `ada@example . com`); only counts, sizes, dates and the like use `figure`.
- **Phase 8 – the line tab variant underlines in the brand color** (`ui/tabs.tsx`, `after:bg-brand`): the selected tab is one of the accent's jobs.

- **Phase 7 – copy / like / dislike assumption confirmed by the user (2026-11-12):** copy is client-only and not recorded; like and dislike are saved (dislike with an optional reason and comment).
- **Phase 7 – built from the primitives, not `npx assistant-ui add thread`.** The plan said to add the thread element and restyle it. The generated element is a large shadcn-styled composition that would be rewritten almost entirely to meet DESIGN.md (flat, hairlines, mono figures, no pills), so the components in `src/components/chat/` are written directly on `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `ActionBarPrimitive`, `ThreadListPrimitive` and `ThreadListItemPrimitive`. `components.json` is untouched.
- **Phase 7 – `ThreadPrimitive.Messages` and `ThreadListPrimitive.Items` use the children render function** (the `components` prop is deprecated in 0.15).
- **Phase 7 – no un-like.** The runtime's `submitFeedback` has no "clear" call, so a rating can be changed (like to dislike replaces it on the server) but not removed from the UI. `DELETE /api/messages/{id}/feedback` exists and is unused. Cheap follow-up if wanted.
- **Phase 7 – chats cannot be archived** (`archive` / `unarchive` are no-ops and the UI offers rename and delete only).
- **Phase 7 – plain-text math.** `gpt-6-luna` writes arithmetic as inline LaTeX (`\( (2{,}100 - 2{,}000) \div 2{,}000 \)`), which Markdown shows as backslashes. `plainMath()` rewrites the common inline forms. The proper fix is a prompt line in `backend/app/prompts.py` ("write math in plain text, no LaTeX"); that file belongs to Phase 3, so it is only noted here.
- **Phase 7 – the no-credits state disables the composer** (banner + disabled input) once the dashboard shows a balance of 0, and a stale balance still gets a clear 402 error message with no charge.

- **Phase 6 – fonts: Schibsted Grotesk + Spline Sans Mono.** Chosen with the skill's font procedure (voice: exact, annotated, unhurried; physical object: an engineering datasheet with ruled figure tables). Schibsted is a sturdy news grotesk with a wide weight range, so one family covers display to caption; Spline Sans Mono is compact with tabular figures and a slashed zero for the data columns. Rejected: the skill's reflex list (Inter, IBM Plex, Space Grotesk, DM Sans, ...), Geist (the old font) and DM Serif Display, and wider monos (Azeret, Martian) that bloat dense figure tables. Both load through `next/font`, so they are self-hosted and preloaded.
- **Phase 6 – neutral hue is cool graphite (hue 250 to 255), not warm.** The brief said "cool-neutral ... tinted toward the brand hue"; vermilion (hue 34) is warm, so tinting literally would warm the paper. Chosen: cool-tinted neutrals (chroma at most 0.025) with the warm vermilion as the complement, which reads as red pencil on graphite paper.
- **Phase 6 – the accent is `brand`, with `primary` as an alias.** So the stock shadcn primitives become vermilion without edits, while bespoke components can say `bg-brand`. shadcn's `accent` stays a neutral hover wash.
- **Phase 6 – the contrast of destructive vs brand.** Both are red-orange family, so destructive is a darker, bluer crimson (hue 18) and must always carry an icon or word (DESIGN.md, The Not-Color-Alone Rule).
- **Phase 6 – "No pill badges" applied to the `Badge` primitive** (now `rounded-sm`) and avatars are square-ish (`rounded-sm`); focus ring stays the 3px 50% vermilion ring from shadcn (crisp datasheet look was not worth restyling every primitive).
- **Phase 6 – PRODUCT.md was written without a live interview.** The plan says approving it counts as confirming the brief, and the design brief supplies audience, scene, lane, anti-references and accessibility; the skill's questions were answered from the brief rather than asked again. DESIGN.md was written forward-looking (not scanned), as the phase file requires, with the OKLCH values in the frontmatter (the Stitch linter warns about non-hex colors; accepted).
- **Credits assumption confirmed by the user (2026-11-11):** 5 documents + 25 messages on signup, 1 per upload and 1 per chat turn.
- **Failed documents can be re-uploaded.** A `failed` row would otherwise block the same file through the unique `(user_id, checksum)` index, so the create transaction deletes a same-checksum `failed` row first. Any other state is `409 DUPLICATE_DOCUMENT`.
- **A document deleted while `processing` is not refunded** (the credit was spent on the work in flight); its ingestion then finds no row and ends quietly.
- **The stale sweep is age-based** (`INGESTION_STALE_MINUTES=10`, run at startup and every 5 minutes) rather than "everything `processing` at boot", because the local and the eventual production backend share one Postgres: a local restart must not fail documents the other instance is still ingesting.
- **Local MinIO uses ports 9100/9101 and the `pgsty/minio` image** (the official `minio/minio` image is no longer on Docker Hub; 9000/9001 are held by another local project).
- **DB tests use a throwaway schema on the configured `DATABASE_URL`** (`docgenie_test_<random>`, dropped at the end) because that is the only Postgres with pgvector here; they never touch `document_genie`.
- `gpt-6-luna` confirmed for flex tier, `reasoning.effort=medium`, reasoning summaries and image input (see Phase 1 log). Assumption closed.
- **Service tier default changed from `flex` to `default` (user decision, 2026-11-11)** because flex 429s often. `CHAT_SERVICE_TIER=flex` remains an opt-in env override; `FLEX_FALLBACK_TIER` only matters in that case. Phase 3 should still catch the flex 429 and fall back if flex is ever enabled.
- **Phase 3 – copy/like/dislike assumption: NOT confirmed with the user.** The session ran non-interactively, so the question could not be asked. Implemented as planned: feedback is like/dislike only (`reason`, `comment` optional); copy is client-only and never sent to the backend. Phase 7 should confirm it before building the toolbar. It is cheap to change either way.
- **Phase 3 – stateless Responses calls.** Every model call sets `store=False` and replays the conversation itself: history, the output items so far (reasoning items included, via `include=["reasoning.encrypted_content"]`) and the tool results. Nothing is retained at OpenAI and the loop does not depend on `previous_response_id`. Verified live with `gpt-6-luna`.
- **Phase 3 – message status `incomplete`.** Phase 1's check constraint only knew `stopped`; migration `0002` added `incomplete` (client disconnect, or a failure after some answer text). `stopped` and `streaming` remain allowed but are not written.
- **Phase 3 – credit is spent unless no answer text was produced.** Reserved before streaming (402 if empty). Refunded when the run ends with no answer text: LLM error, empty answer, or disconnect before any text. Kept when any answer text was delivered (the message is then `incomplete`).
- **Phase 3 – citations are the sources the answer cites.** Tool results are numbered `[n]` per turn; after the answer, one `citation` event per `[n]` marker actually present in the text. Replayed history has the old `[n]` markers stripped (numbers restart each turn). Page ranges are chunk-level (one chunk can span two pages).
- **Phase 3 – the chat request may carry `document_ids`.** The plan's `PATCH /sessions/{id}` cannot set a selection before the session exists (the first message creates it), so `POST /chat/stream` accepts an optional `document_ids` (omitted = keep, list = set, `[]`/null = all). PATCH remains for later changes.
- **Phase 3 – extra `session.title` SSE event** after `message.end` (not in the plan's event list) so the UI learns the title without a second call; it is additive.
- **Phase 3 – the system prompt says "skip `list_documents` before `search_documents`".** The first live run always listed first, costing a whole extra model round trip; the prompt change dropped the PDF question from 3 steps to 2.
- **Phase 3 – gpt-6-luna prices are not known to the repo.** Cost uses `LLM_INPUT_PRICE_PER_M` / `LLM_OUTPUT_PRICE_PER_M` when the user sets them (flex scaled by `FLEX_PRICE_MULTIPLIER`); otherwise `cost_usd` stays `NULL`.
- **Phase 4 – the contact form stays on n8n (user decision, 2026-11-12).** The assumption (store in DB + email via Resend) was NOT adopted: the user said there are no changes to the contact workflow. So there is **no `POST /v1/contact`**, no `CONTACT_NOTIFY_EMAIL`, and the backend has no Resend dependency. `src/app/api/contact/route.ts` keeps calling its n8n webhook (`N8N_CONTACT_FORM_WEBHOOK_ID`). Consequences for Phase 5: do NOT delete `src/lib/n8n.ts` (only `callN8nWebhook` is needed), keep `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY` and `N8N_CONTACT_FORM_WEBHOOK_ID`, remove the other `N8N_*` vars and files, and read its exit criterion "`grep -ri n8n src/` returns nothing" as "only the contact route and `lib/n8n.ts` mention n8n". The unused `contact_submissions` table and `ContactSubmission` model (Phase 1) were removed by migration `0003` (the table was empty; applied to the shared database 2026-11-12).
- **Phase 4 – service tier re-checked (user request, 2026-11-12):** nothing sets flex. Code default, `.env.example` and the effective environment (`backend/.env`, process env) are all `default`; no change was needed.
- **Phase 4 – export is built on disk, not in memory** (anonymous temp file, streamed back, removed on close), so large libraries do not use RAM. An original missing from storage is listed in `account.json.missing_files` and does not fail the export; any other storage error is a 503, because a partial export right before an account deletion would be dangerous.
- **Phase 4 – deletion order is DB first, storage second** (see the endpoint notes). The call is idempotent, so a storage failure is fixed by calling again.
- **Phase 4 – the dashboard is read-only** (user request, 2026-11-12). It first granted signup credits lazily, which re-created a credit account for a user who had just been deleted. Now a user with no account sees 0 / 0 and nothing is written. Phase 5 must therefore make the signup hook reliable (a new user whose grant call failed would see 0 until their first upload, which still grants lazily via `credits.reserve`).
- **Phase 4 – usage is derived from the credit ledger**, not `llm_usage`, because `cost_usd` is still NULL (no model prices) and token counts mean little to a user. The "usage" Phase 8's Overview shows is documents and messages spent per day, net of refunds.
- `/v1/health` also requires `X-Internal-Key` (plan: every request). The Dockerfile health check sends it.
- `user_id` columns are `text` with no FK to Better Auth's `user` table (its id is `text`); Phase 4 account deletion must delete by `user_id`.
- Alembic's version table is `document_genie.alembic_version` (the server is shared; other schemas have their own).
- Added `CHECK (balance >= 0)` on credit accounts as a race backstop.
- Python deps pinned by `backend/uv.lock`; Python 3.12 only.

- **Phase 5 – the route layout is RESTful and mirrors the backend** (`/api/documents/{id}`, `/api/sessions/{id}/messages`, ...) instead of the old verb-style paths (`documents/upload`, `chat/message`), as the phase file's `src/app/api/chat/route.ts` implies. The old routes were deleted, not kept as aliases.
- **Phase 5 – account deletion hooks Better Auth's `beforeDelete`** rather than a route that calls the backend and then Better Auth: the backend is only called after the password / freshness check, and Better Auth's own endpoint cannot be used to skip the backend wipe.
- **Phase 5 – a backend 401 is surfaced as 502** (`BACKEND_AUTH_FAILED`), so a wrong `INTERNAL_API_KEY` is not mistaken for a signed-out user.
- **Phase 5 – `src/lib/n8n.ts` kept, trimmed to `callN8nWebhook`** (contact form only), per the Phase 4 decision. The grep exit criterion is read as agreed there.
- **Phase 5 – old chat workarounds removed:** `normalizeContent` (replaced a literal `\n`) and `stripOuterQuotes` in `chat-messages.tsx` were n8n-era fixes and would corrupt correct Markdown from the new backend.
- **Phase 5 – upload limits** are `MAX_UPLOAD_MB = 20` / `MAX_UPLOAD_PAGES = 50` in `src/lib/constants.ts` (UI text and an early size check); the backend is the authority.

### Known issues and deferred work
- **Leftover emerald and old styling: none (Phase 9).** `grep -rE "\b(emerald|slate|zinc|gray|green|blue|amber|red)-[0-9]{2,3}\b|bg-white|text-white|font-display|fontStyle" src` returns nothing, and the `--font-display` alias is deleted from `globals.css`. The only hex values left in `src` are the Google logo fills (Phase 8), `lib/brand.ts` (image contexts) and the inline-styled email HTML in `lib/email.ts` (slate hex from before the rebuild; emails are not part of the site's design system and were not restyled).
- **Em dashes:** none in user-visible copy under `src` (Phase 9 also fixed three email strings). Code comments still contain some; they are not user-visible.
- **Legal copy** was brought in line with the shipped features in Phase 9 (see Decisions). Keep it true if limits, providers or deletion behavior change.
- **Landing figures are copied, not imported:** the retrieval numbers in `landing/content.ts` (`PIPELINE_CONFIG`) mirror `backend/app/config.py`. There is no test that ties them together.
- **Hero replay figures are from the development setup** (remote database: 5 s search, 9.5 s to first token). Refresh them in `hero-replay.tsx` after deployment if production is faster.
- **About has no author name, link or contact detail**, and the OG image uses Satori's default font. Both are easy follow-ups if the user wants them.
- ~~Coolify still holds the nine removed `N8N_*` vars~~ **Resolved in Phase 11** (deleted; `BACKEND_API_URL` and `INTERNAL_API_KEY` added).
- **A title is not generated if the client disconnects right after `message.end`** (found in Phase 10). `generate_title` runs inside the SSE generator after the last yield (`backend/app/services/chat.py`, near line 454), so closing the tab within a second or two of the answer finishing leaves the session untitled ("New chat" in the list). Rare; the fix is to run the title as a detached task, like the other persistence work (`drain_background`). Not changed in Phase 10 (Phase 3 code, verification phase).
- **Citation marks are 18x13 px** (inline marks in the answer text and in the landing hero). They have a 32 px `SourceChip` equivalent under the answer, and WCAG 2.2 treats targets inside running text as exempt, so they were left as they are. Several icon buttons are 32 to 36 px (above the 24 px AA minimum, below 44 px). On the landing page and chat at 390 px: the wordmark link (105x20) and "View credits" (75x20) are under 24 px high; they are isolated, so the spacing exception applies. Revisit if touch comfort matters.
- **The dashboard loading skeletons have no `<h1>`** (axe `page-has-heading-one` fires on a skeleton frame while data loads; the loaded pages have one). Transient; an `sr-only` h1 in each `loading.tsx` would clear it.
- **A stray pytest schema `docgenie_test_1b4ffeb9` remains on the shared database** (from an earlier killed run: it still has the `contact_submissions` table that migration `0003` dropped, newest rows 2026-11-12 02:05 UTC; not from Phase 10, whose own run cleaned up). Safe to drop: `DROP SCHEMA docgenie_test_1b4ffeb9 CASCADE;` (left for the user, who owns the shared database).
- **Flex tier** is opt-in (`CHAT_SERVICE_TIER=flex`); the fallback retry on `FLEX_FALLBACK_TIER` is implemented (Phase 3). Measured live (Phase 3, 27 flex calls with a trivial one-word prompt): 6 to 15 s per call (default tier: about 1 to 2 s per model call), and "Flex processing is temporarily unavailable" showed up once (4 of 5 in the Phase 1 probe, so the rate varies a lot). It arrives either as an HTTP 429 at request time or, as seen in that one case, as an `APIError` from inside the open stream about 1.7 s in; the retry handles both when no content has been streamed yet. The in-stream shape was only reproduced with a fake in tests (the live fix was not re-observed because the unavailability did not recur in the 21 calls after it). Not recommended as the default for an interactive chat.
- **`gpt-6-luna` prices are still unknown** to the repo, so `llm_usage.cost_usd` is `NULL` for chat, title and OCR. Set `LLM_INPUT_PRICE_PER_M` / `LLM_OUTPUT_PRICE_PER_M` in `backend/.env` (the user has to supply them); nothing else needs to change.
- **Latency on the dev setup:** `message.start` arrives about 2 to 4 s after the request because `prepare_turn` makes roughly 8 round trips to the remote VPS database (about 1 s each). With the database next to the backend (production) this is a few tens of ms. The same remote latency inflates `search_documents` (about 3 to 5 s) and therefore `ttft_ms`.
- **Reasoning summaries are optional**: easy questions often produce none (`reasoning_tokens` 0). The UI must not wait for or require them; they come as Markdown with a bold heading line.
- **A turn that is cut off mid-tool-call** keeps the user message and an `incomplete` assistant message; there is no "resume". If the backend process itself is killed mid-stream, no assistant row is written and the reserved credit is not refunded (no sweep exists for chat, unlike ingestion). Rare; revisit if it ever matters.
- Test and e2e runs are slow (about 1 s per DB round trip) because the dev database is the remote VPS Postgres. Production will have the database next to the backend.
- Existing (pre-rebuild) users: handled. `credits.reserve` grants the signup credits lazily, and `scripts/regrant_signup_credits.py` was run once on 2026-11-11 (4 users granted 5 + 25).
- The `STORAGE_FAILED` ingestion code exists but nothing sets it yet (the object is uploaded synchronously before ingestion starts; a failure there is a 503 at upload time with the row removed and the credit refunded).
- n8n API key was rotated by the user (2026-11-11) and `.env.local` updated; `N8N_API_KEY` updated in Coolify for both the production and preview entries via the API (values verified equal to local). **Coolify env changes only take effect on the next deploy** (the var is build-time and runtime); the app has not been redeployed, so the live site may still hold the old key until then. **Update (Phase 11): the frontend was redeployed on 2026-11-12, so the rotated key is live, and a production contact submission through it succeeded.**

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
  - *MinIO:* API 9100, console 9101, bucket `docgenie` (and `docgenie-test` for pytest), start with `docker compose --env-file backend/.env -f docker-compose.dev.yml up -d`; env names `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` (values in `backend/.env`).
  - *Public functions of `credits.py` / `storage.py`:* listed in Current state > Contracts.
  - *Ingestion `error_code` values:* `NO_TEXT_FOUND`, `PARSE_FAILED`, `OCR_FAILED`, `EMBEDDING_FAILED`, `TEXT_TOO_LARGE`, `PROCESSING_INTERRUPTED`, `INTERNAL_ERROR` (and the unused `STORAGE_FAILED`). Phase 8 maps them to readable messages. Upload-time errors are HTTP codes (see the endpoint table).
  - *Response shapes:* `backend/app/schemas/documents.py` (`DocumentOut`, `DocumentListOut`), summarised in Current state > HTTP endpoints.
  - *Test setup:* `tests/conftest.py` sets `DB_SCHEMA=docgenie_test_<random>` before the app imports, creates it with `Base.metadata.create_all` on the `DATABASE_URL` database, and drops it at the end; MinIO bucket `docgenie-test` is emptied at the end. Command: `uv run pytest -q` from `backend/` (MinIO container must be up).
  - *Re-grant script:* `backend/scripts/regrant_signup_credits.py`, run once on 2026-11-11: 4 existing users granted 5 + 25; a second run granted 0.
  - *Credits assumption:* confirmed by the user (5 + 25, 1 per upload and per turn).
- **How to verify this phase still works:** `docker compose --env-file backend/.env -f docker-compose.dev.yml up -d` (repo root); from `backend/`: `uv run pytest -q` (about 4 min); `uv run uvicorn app.main:app --port 8765`, then `curl -H "X-Internal-Key: <value from backend/.env>" localhost:8765/v1/health` (expect database and storage `ok`); optionally `PYTHONPATH=. uv run python scripts/e2e_ingest.py http://localhost:8765` (real OpenAI, a few cents).
- **Open issues / follow-ups:**
  - Phase 3: fill `PRICING` for `gpt-6-luna` (OCR cost is NULL until then); retrieval should query `document_chunks` filtered by `user_id` and `document_id`; for CSV documents the aggregate/SQL tool reads `document_rows` (`row_data` values are all strings, `csv_schema.columns[].type` says how to cast).
  - Phase 4: account deletion must call `storage.delete_prefix(storage.user_prefix(user_id))` and delete credit/usage rows by `user_id`; the dashboard endpoint needs balances (`credits.get_balances`).
  - Phase 5: the Next.js upload proxy must forward the multipart body without setting `Content-Type`, and the Better Auth hook calls `POST /v1/users/{id}/signup-credits`. The frontend must poll `GET /v1/documents/{id}` while `processing`.
  - Phase 8: map the ingestion error codes above to readable messages.
  - Phase 11: a production bucket and `S3_*` values come from the Coolify MinIO service (`add-minio-storage-to-coolify`), and the container is single-process, so the in-process background tasks are fine; if it ever runs several workers the sweep still works because it is age-based and race-safe.
  - A one-line status of the old `bytea` data: nothing migrated, by plan.
- **Notes for the next session:** Phase 3 can start. Start the MinIO container first if you want to run the whole test suite. Chunks already carry `page_start` / `page_end` for citations (null for CSV). Embeddings are `text-embedding-3-small` at 1536 dimensions.

### Phase 3: Retrieval, agent and chat stream (2026-11-12)

- **Status:** done
- **Commit:** see the status table in README.md
- **What was built:**
  - `backend/app/services/`: `retrieval.py` (hybrid RRF search, one SQL statement), `sql_guard.py` (safe CSV SQL), `tools.py` (the four tools + numbered citation sources), `agent.py` (hand-written tool loop, `AgentStats`, `Accumulator`), `chat.py` (turn preparation, SSE streaming, persistence, titles; not in the plan's file list), `llm.py` (extended: `stream_response` with flex fallback, `generate_text`, `LlmError`), `usage.py` (cost from env prices).
  - `backend/app/routers/`: `chat.py` (`POST /v1/chat/stream`), `sessions.py`, `feedback.py`; `schemas/chat.py`; `prompts.py` (system and title prompts); `main.py` wires the three routers.
  - `backend/alembic/versions/0002_chat_message_incomplete_status.py` (applied) and the matching model constraint.
  - `backend/docs/chat-stream.md`: the SSE contract with real examples.
  - Config: new tunables in `app/config.py` and `.env.example`; `sqlglot` added to `pyproject.toml`.
  - Tests (98 new, 175 total): `tests/test_sql_guard.py`, `tests/test_retrieval_tools.py`, `tests/test_chat.py`, plus `tests/fake_llm.py` (scripted streaming Responses fake) and `make_document`/`one_hot` in `tests/factories.py`; `conftest.py` patches `llm.get_client` in the `fake_openai` fixture.
  - `backend/scripts/e2e_chat.py` (live end-to-end check).
- **Exit criteria:**
  - PASS: a chat about an uploaded PDF streams a cited answer, a `search_documents` trace and metrics (live run through uvicorn with the real model, `scripts/e2e_chat.py`). **Reasoning**: `reasoning.delta` events were seen live on the harder question; easy questions produce none because the model skips reasoning (see Known issues), so the "streams reasoning" part depends on the question.
  - PASS: a chat about a CSV uses `query_table` successfully (live: per-region totals correct).
  - PASS: the session gets a server-generated title after the first turn (live, e.g. "Notice Period for Terminating the Agreement").
  - PASS: all tests: 175 passed (full run 173 in about 9 minutes, plus the two flex-in-stream tests; `tests/test_chat.py` re-run: 24 passed).
  - Plan test items: hybrid search keyword-only and semantic-only matches (`test_hybrid_returns_keyword_only_and_semantic_only_matches`), `sql_guard` rejections incl. writes/other tables/multiple statements/escaping functions (parametrized, plus real-DB read-only and timeout checks), no cross-user data from retrieval and `query_table`, the stream contract (order, reasoning + tool events, metrics in `message.end`), 402 before streaming, refund on failure, disconnect stored as `incomplete` (also verified on a real uvicorn by dropping the connection), cross-user denial on session, message and feedback endpoints.
- **Deviations from the phase file:**
  - Added `services/chat.py` (orchestration) and `prompts.py`; the plan listed neither.
  - Chat status `incomplete` needed migration `0002` (Phase 1's constraint only had `stopped`).
  - `POST /chat/stream` accepts an optional `document_ids` (see Decisions); an extra `session.title` event follows `message.end`.
  - The error codes in the stream are `LLM_BUSY`, `LLM_TIMEOUT`, `LLM_ERROR`, `INTERNAL_ERROR`; `INSUFFICIENT_CREDITS` is the pre-stream HTTP 402 only, and there is no `INTERRUPTED` event because a disconnected client cannot receive one.
  - No `gpt-6-luna` prices could be filled into `PRICING` (not known to the repo): cost is configurable by env and `NULL` until set.
  - `get_document_text` returns whitespace-normalised text (chunks are stored stripped), with `[Page N]` markers.
- **Decisions made:** see Current state > Decisions (copy/like/dislike unconfirmed, stateless Responses calls, `incomplete` status, credit and refund rule, citation rule, `document_ids` on the chat request, `session.title` event, prompt change, prices).
- **Phase-specific handoff items:**
  - *The exact SSE contract:* [backend/docs/chat-stream.md](../../backend/docs/chat-stream.md), one real example per event (`message.start`, `reasoning.delta`, `tool.start`, `tool.end`, `text.delta`, `citation`, `error`, `message.end`, `session.title`).
  - *Response shapes of the session, message and feedback endpoints, including `parts` and `metrics`:* Current state > HTTP endpoints, and the "How a turn is stored" section of chat-stream.md.
  - *Where the system prompt lives:* `backend/app/prompts.py`.
  - *Flex fallback in practice:* Known issues (6 to 15 s per call on flex vs 1 to 2 s on default; unavailable 1 of 27 calls now, 4 of 5 in Phase 1; arrives as a 429 or as an in-stream `APIError`; both handled; the in-stream fix was tested with a fake only).
  - *`sqlglot` limits in `sql_guard`:* Current state > Contracts > `query_table` SQL rules. Verified accepted: joins and self-joins on `rows`, subqueries, window functions, `FILTER`, `PERCENTILE_CONT ... WITHIN GROUP`, `ILIKE`, `~`, `CASE`, `EXISTS`, casts. Verified rejected: DDL/DML, `COPY`, `SET`, `WITH`, `UNION`, `INTO`, `FOR UPDATE`, placeholders, other tables, schema-qualified names, `pg_read_file`, `pg_sleep`, `set_config`, `current_setting`, `version()`, `dblink`, `lo_import`, `nextval`, `query_to_xml`, `generate_series`/`pg_ls_dir` in `FROM`, `current_user`/`user`/`session_user`.
  - *Copy/like/dislike assumption:* implemented as like/dislike (copy client-only) but **not confirmed with the user** (non-interactive session). Phase 7 should ask.
- **How to verify this phase still works:** MinIO up (`docker compose --env-file backend/.env -f docker-compose.dev.yml up -d` from the repo root); from `backend/`: `uv run alembic current` (expect `0002`); `uv run pytest -q` (175 tests, about 9 minutes; the offline SQL-guard tests run in under a second: `uv run pytest tests/test_sql_guard.py::test_allows_plain_selects_over_rows tests/test_sql_guard.py::test_rejects_unsafe_sql -q`); start the server (`uv run uvicorn app.main:app --port 8765`) and run `PYTHONPATH=. uv run python scripts/e2e_chat.py http://localhost:8765` (live model, a few cents).
- **Open issues / follow-ups:**
  - User: provide `gpt-6-luna` prices (`LLM_INPUT_PRICE_PER_M`, `LLM_OUTPUT_PRICE_PER_M`) so `cost_usd` is filled.
  - Phase 4: the dashboard endpoint should read `llm_usage` / balances; `chat_sessions`, `chat_messages`, `message_feedback`, `llm_usage` rows must be deleted by `user_id` on account deletion (and the account export may include sessions/messages).
  - Phase 5: proxy `POST /v1/chat/stream` **unchanged** (stream the body through, keep the `Content-Type: text/event-stream` and `Cache-Control` headers, forward the client abort so the backend cancels the model run; do not buffer); also add proxies for sessions, messages, feedback. A 402 comes back as JSON before any stream.
  - Phase 7: build the adapter from `backend/docs/chat-stream.md`; reasoning text is Markdown and optional; `[n]` markers in the answer pair with `citation` events (chunk-level page ranges; CSV citations carry the SQL as the snippet); tool outputs are intentionally not streamed (only a summary); the title arrives after `message.end`; confirm copy/like/dislike with the user.
  - Phase 8: map `LLM_BUSY` / `LLM_TIMEOUT` / `LLM_ERROR` / `INTERNAL_ERROR` to readable messages, with a retry action (the credit is refunded when no answer text was produced).
  - Phase 11: `hnsw.iterative_scan` is set per query via `set_config` (pgvector 0.8 feature, present on the dev server); check the production database's pgvector version. A chat run killed together with the backend process leaves a spent credit and no assistant message (no sweep), acceptable for now.
- **Notes for the next session:** Phase 4 can start (it does not depend on the chat stream's wire format, only on tables and balances). The dev server is not left running. A real-model check costs a few cents (`scripts/e2e_chat.py`). Remember `backend/.env` has no model prices yet.

### Phase 4: Dashboard and account endpoints (2026-11-12)

- **Status:** done. The contact endpoint was dropped by the user's decision, so the exit criterion "the backend can replace all n8n workflows" holds for every workflow except contact, which deliberately stays on n8n.
- **Commit:** see the status table in README.md
- **What was built:**
  - `backend/app/routers/dashboard.py`, `routers/account.py`; `services/dashboard.py`, `services/account.py`; `schemas/dashboard.py`, `schemas/account.py`; both routers wired in `main.py`.
  - `services/storage.py`: new `ObjectNotFound` (subclass of `StorageError`) so a missing key is distinguishable from an outage.
  - `config.py` / `.env.example`: `DASHBOARD_RECENT_LIMIT`, `DASHBOARD_ACTIVITY_LIMIT`, `DASHBOARD_USAGE_DAYS`; removed the now-pointless `RESEND_API_KEY` and `CONTACT_NOTIFY_EMAIL` backend settings.
  - `backend/alembic/versions/0003_drop_contact_submissions.py` (applied): drops the unused, empty `contact_submissions` table; the `ContactSubmission` model is gone. Downgrade recreates the table.
  - The dashboard is read-only (never grants credits), so it cannot resurrect a deleted account.
  - `tests/test_account_dashboard.py` (18 tests).
  - Also in this session: committed the Phase 3 work (`3ee09c8`) and re-checked the service tier (nothing set flex; see Decisions).
- **Exit criteria:**
  - PASS: every endpoint in the plan's table exists and is tested, except `POST /v1/contact`, which was removed from scope by the user (see Deviations).
  - PASS (with that exception): the backend can replace all n8n workflows.
  - PASS: dashboard numbers match the DB after uploads, chats and a refunded failed upload; export contains every JSON section and every original byte for byte; deletion leaves no row in any table with a `user_id` column and no object under the prefix (the test also checks another user is untouched and a user id that is a string prefix of another does not delete the longer one); cross-user access is denied on every new endpoint; missing key or user header is 401.
  - Also verified live through uvicorn with a throwaway user and the real database and MinIO: dashboard, upload, dashboard, export, delete, empty afterwards.
- **Deviations from the phase file:**
  - **No `POST /v1/contact`, no Resend, no `CONTACT_NOTIFY_EMAIL`** (user: the contact workflow keeps using n8n). The three contact tests in the plan do not exist for that reason. Phase 5 task 6 ("forward to `POST /v1/contact`") and task 2 (delete all n8n code) must be adjusted as described under Decisions.
  - `DELETE /account` returns `200 {deleted: {...}}` instead of an empty 204 (the counts make it testable and loggable).
- **Decisions made:** see Current state > Decisions (contact stays on n8n, service tier re-check, export on disk, DB-then-storage deletion order, read-only dashboard, usage from the ledger).
- **Phase-specific handoff items:**
  - *`GET /v1/dashboard` shape, export zip layout, deletion order and what Next.js does afterwards (delete the Better Auth user):* Current state > HTTP endpoints, directly under the endpoint table.
  - *Env vars:* only the three optional `DASHBOARD_*` tunables are new. `CONTACT_NOTIFY_EMAIL` and the Resend sender do not exist; the contact assumption was **rejected** by the user.
  - *Full endpoint table for the whole backend* (every route is under `/v1` and needs `X-Internal-Key`; every route except the first two also needs `X-User-Id`; a missing/invalid key or user id is `401 UNAUTHORIZED`; a malformed body, query or path id is `422 VALIDATION_ERROR`; another user's resource is always `404 NOT_FOUND`). There is no generated OpenAPI (docs are disabled on the private app), so this table is the reference. Response shapes are in the Current state sections referenced in the last column.

| Method and path | Request | Success | Other error codes | Shape |
|---|---|---|---|---|
| `GET /health` | none | `200` | `503` if database or storage is `error` | Current state > HTTP endpoints |
| `POST /users/{user_id}/signup-credits` | no `X-User-Id` | `200 {granted, credit_balance, message_balance}` | | same |
| `GET /credits/history` | `?limit=50&offset=0` | `200 {transactions}` | | same |
| `POST /documents` | multipart `file` | `202 DocumentOut` (`processing`) | `402 INSUFFICIENT_CREDITS`, `409 DUPLICATE_DOCUMENT`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_TYPE`, `400 PAGE_LIMIT_EXCEEDED`, `400 ROWS_LIMIT_EXCEEDED`, `503 STORAGE_UNAVAILABLE` | `schemas/documents.py` |
| `GET /documents` | none | `200 {documents}` | | same |
| `GET /documents/{id}` | none | `200 DocumentOut` (poll while `processing`) | `404` | same |
| `GET /documents/{id}/content` | `?download=true` optional | `200` file stream | `404`, `503` | same |
| `DELETE /documents/{id}` | none | `204` | `404`, `503` | same |
| `POST /chat/stream` | `{session_id, message, document_ids?}` | `200` SSE | `402 INSUFFICIENT_CREDITS` (before the stream), `404` (other user's session or document) | [chat-stream.md](../../backend/docs/chat-stream.md) |
| `GET /sessions` | none | `200 {sessions}` | | Current state > HTTP endpoints |
| `GET /sessions/{id}/messages` | none | `200 {messages}` | `404` | same |
| `PATCH /sessions/{id}` | `{title?, document_ids?}` | `200 SessionOut` | `404`, `422` (empty title) | same |
| `DELETE /sessions/{id}` | none | `204` | `404` | same |
| `PUT /messages/{id}/feedback` | `{rating, reason?, comment?}` | `200 {message_id, rating, reason, comment}` | `404`, `422` (not an assistant message) | same |
| `DELETE /messages/{id}/feedback` | none | `204` (idempotent) | `404` | same |
| `GET /dashboard` | none | `200 DashboardOut` | | Dashboard response |
| `GET /account/export` | none | `200` zip | `503 STORAGE_UNAVAILABLE` | Export zip layout |
| `DELETE /account` | none | `200 {deleted}` | `503 STORAGE_UNAVAILABLE` (rows already gone; call again) | Account deletion order |

- **How to verify this phase still works:** MinIO up; from `backend/`: `uv run alembic current` (expect `0003`), then `uv run pytest tests/test_account_dashboard.py -q` (18 tests, about 6 minutes against the remote DB) or the whole suite `uv run pytest -q` (193 tests passed on 2026-11-12, about 13 minutes). Offline guard: `uv run pytest tests/test_account_dashboard.py::test_every_table_with_a_user_id_is_deleted_with_the_account -q`.
- **Open issues / follow-ups:**
  - Phase 5: (1) proxies for `GET /dashboard`, `GET /account/export` (stream the zip through with its headers) and `DELETE /account`; call `DELETE /account`, and only on a 200 delete the Better Auth user; sign the user out. (2) The contact route keeps its n8n webhook: see the Decisions entry for what to keep and what to delete.
  - Phase 8: the Overview can use `recent_activity` and `usage.daily` as they are; map `recent_documents[].error_code` to readable messages. The Settings export button downloads from `/api/account/export`.
  - Account deletion does not stop a chat or ingestion that is running at that moment (it may write one last row or object for the deleted user). Acceptable: the UI blocks other actions during deletion and Next.js signs the user out; revisit if it ever matters.
- **Notes for the next session:** Phase 5 can start. Read the Phase 4 Decisions entry first: it changes Phase 5's contact and n8n-removal tasks. The dev server is not left running.

### Phase 5: Frontend data layer swap (2026-11-12)

- **Status:** done
- **Commit:** af3a377
- **What was built:**
  - `src/lib/backend.ts` (client), `src/lib/sse.ts` (SSE reader), `src/types/api.ts` (response types and the SSE event union), `src/lib/constants.ts` (upload limits).
  - Routes under `src/app/api/`: `dashboard`, `documents` (+ `[id]`, `[id]/content`), `chat`, `sessions` (+ `[id]`, `[id]/messages`), `messages/[id]/feedback`, `credits/history`, `account` (DELETE), `account/export`. The old n8n routes are deleted (route map in Current state > Frontend contracts).
  - `src/lib/auth.ts`: the signup hook calls the backend; `user.deleteUser` with a `beforeDelete` that wipes the backend data.
  - `src/contexts/dashboard-data.tsx`: slimmed, with document-status polling.
  - `src/middleware.ts` renamed to `src/proxy.ts` (export `proxy`).
  - Deleted: `lib/n8n-{documents,data,credits,analytics,delete}.ts`, `types/n8n.ts`, `lib/refresh-credits.ts`; `lib/n8n.ts` trimmed to `callN8nWebhook`.
  - Existing UI re-pointed so the app keeps working (temporary where Phases 7 and 8 replace it): `chat/page.tsx`, `chat-messages.tsx`, `chat-sidebar.tsx`, `document-list.tsx`, `document-upload.tsx`, `pdf-viewer.tsx` (now takes a `Blob`), `credits-section.tsx` (fetches its own history), `dashboard/page.tsx` (recent chats from `dashboard.recent_sessions`).
  - Env: `.env.local` and `.env.example` updated (names in Current state > Env vars).
- **Exit criteria:**
  - PASS: `npx tsc --noEmit` is clean; `npm run build` succeeds and lists `Proxy (Middleware)`.
  - PASS (as agreed in Phase 4): `grep -ri n8n src/` matches only `lib/n8n.ts`, `api/contact/route.ts` and the (corrected) privacy page copy.
  - PASS: end to end against MinIO + uvicorn + `next dev` with a throwaway Better Auth user. Sign-up reached the backend through the hook (5 documents / 25 messages). Upload via the proxy returned 202 `processing` and polled to `ready`; the content bytes were identical to the upload. Chat streamed through `/api/chat` incrementally (first event at 4 s, tool step, tokens, citation, `message.end`, `session.title`) with the right headers; a client disconnect mid-answer was stored by the backend as `incomplete`. Sessions list/rename/delete, feedback like/delete, credit history and the export zip (all sections plus the original) worked; every route returned 401 without a session; document delete worked. Account deletion: a wrong password changed nothing; the right password left backend rows 0, the MinIO prefix gone, the `user` row gone, cookies cleared and the old cookie at 401.
  - PASS: a scripted real-Chrome run (Playwright on the system Chrome) drove the UI: upload with the "Processing…" badge, PDF preview canvas, streamed chat with Sources, a like that persisted across reload, the credit history tab, delete via the UI; no console or page errors.
  - PASS: `/dashboard` redirects (307) to sign-in without a session cookie, via `proxy.ts`.
  - PARTIAL: contact form: the honeypot (JSON and no-JS 303) and the validation were verified. A real submission was NOT sent, so the live n8n webhook was not exercised (that code path is unchanged).
  - NOT TESTED: a `402` from `/api/chat` was not provoked live (it takes the same JSON relay as the 404/415/422 cases that were tested).
- **Deviations from the phase file:**
  - The contact route and `lib/n8n.ts` stay on n8n (Phase 4 decision), so tasks 2 and 6 differ from the file as agreed.
  - Besides the five routes the phase named, the replaced verb-style routes were deleted too (see Decisions).
  - Minimal UI changes the phase file did not list but "the existing UI works end to end" requires (list above), including a plain "Sources" list under chat answers.
  - No Settings UI for export/deletion was added (Phase 8 owns it); the routes are done and were verified over HTTP.
- **Decisions made:** see Current state > Decisions (route layout, `beforeDelete`, 401 as 502, trimmed `n8n.ts`, removed chat workarounds, upload limits).
- **Phase-specific handoff items:** route map, `backend.ts` API, types location, `DashboardDataProvider` surface and polling, and account deletion wiring are under Current state > Frontend contracts. Env var names are under Current state > Env vars.
  - *Functional but temporary UI for Phases 7 and 8 to replace:* the whole chat screen (`chat/page.tsx` renders only `text.delta`, shows citations as a bullet list, ignores reasoning/tool events, has no document selection, no session rename/delete UI and no retry); `chat-messages.tsx` and `chat-sidebar.tsx`; the document list's failure text (`NO_TEXT_FOUND` shown as "no text found"; Phase 8 maps codes to readable messages) and its Dialog preview; the Danger Zone tab in Settings still says "coming soon" (export target `GET /api/account/export`, delete target `DELETE /api/account` with `{password}`); the Overview keeps the old cards (the `dashboard` object also carries `usage.daily`, `recent_activity` and `recent_documents` for the redesign).
- **How to verify this phase still works:** start MinIO, the backend (`uv run uvicorn app.main:app --port 8765`) and `npm run dev`; run `npx tsc --noEmit` and `npm run build`. Sign up a throwaway user (a `delivered+tag@resend.dev` address works with Resend), set `"emailVerified"` to true on its row in `document_genie."user"`, sign in with `POST /api/auth/sign-in/email` (cookie jar) and drive the flows with curl or in the browser. Delete the throwaway user with `DELETE /api/account`.
- **Open issues / follow-ups:**
  - Phase 7: build the assistant-ui adapter on `readChatStream`; confirm copy/like/dislike with the user; send `document_ids` from the selection UI; render reasoning and tool events.
  - Phase 8: Settings export + delete UI (Google-only users have no password and need a fresh session, so offer re-sign-in on `SESSION_EXPIRED`); map ingestion error codes; use `dashboard.usage` and `recent_*`.
  - Phase 9: keep the privacy / FAQ / About claims about OpenAI and third parties true when rewriting (already corrected in Phase 5).
  - Phase 10: `README.md` and `CLAUDE.md` still describe n8n.
  - Phase 11: set `BACKEND_API_URL` and `INTERNAL_API_KEY` in Coolify (runtime), remove the nine dead `N8N_*` vars. The no-JS contact redirect builds its URL from the request, which showed `0.0.0.0` only because dev runs with `--hostname 0.0.0.0`; check it behind Coolify's proxy.
  - Phase 4's backend work (including the `0003` migration) is still uncommitted in the working tree alongside this phase's changes.
- **Notes for the next session:** Phase 6 (design system) has no technical dependency; Phases 7 and 8 follow it. The dev servers are not left running and the throwaway test users were deleted.

### Phase 6: Product and design system (2026-11-12)

- **Status:** done
- **Commit:** 47f60a4
- **What was built:**
  - `PRODUCT.md`, `DESIGN.md` and `DESIGN.json` at the repo root (north star "The Reviewer's Desk"; the six DESIGN.md sections in the skill's fixed order, with grid, spacing and motion folded into Overview).
  - `src/app/globals.css` rewritten: OKLCH tokens for light and dark, mapped through `@theme inline` (surfaces, `brand` family, rules, status, charts, sidebar, type scale, radii, shadows, easing, container width), plus the `figure`, `ds-label`, `page-container`, `page-grid` and `measure` utilities and a global reduced-motion rule.
  - `src/app/layout.tsx`: Schibsted Grotesk and Spline Sans Mono via `next/font/google`, theme-color meta updated, `MotionProvider` mounted. `src/app/(marketing)/layout.tsx`: DM Serif Display removed.
  - New: `src/components/motion-provider.tsx`, `src/lib/motion.ts`. `motion` added to `package.json`.
  - `src/components/ui/*`: no palette classes were present; removed the leftovers that fought the new system (`bg-black/50` to `bg-overlay`, `text-white` to `text-destructive-foreground`, `bg-ds-gray-900` to `bg-muted-foreground`, dark-mode `bg-input/30` fills, `transition-all` to `transition-colors`), pill badge and round avatar to `rounded-sm`, card to `rounded-lg` without shadow, progress to a 6px square track that animates `transform`.
- **Exit criteria:**
  - PASS: `PRODUCT.md` and `DESIGN.md` exist at the root and cover each point of the brief (audience and scene in PRODUCT.md; lane, color, type, layout, motion, copy rules and bans in DESIGN.md).
  - PASS (tokens): `npx tsc --noEmit` and `npm run build` are clean. Contrast was computed for every text and control pair in both themes. A real-browser render of `/sign-in` (headless Edge, system dark) showed the dark tokens and the new sans; a specimen page using the compiled CSS showed light and dark side by side. NOT exercised: clicking the theme toggle (the `ThemeProvider` and the `.dark` class mechanism are unchanged).
  - PASS (fonts): the served HTML preloads both `woff2` files, both return 200, and the compiled CSS defines `Schibsted Grotesk` and `Spline Sans Mono`; the sans is visibly rendered in the screenshot. Checked with curl and a headless screenshot, not the DevTools network panel. The mono was verified by the preload and CSS only, because the specimen's cross-origin font load fell back.
  - PASS: `grep -r emerald src/components/ui` returns nothing (it already returned nothing before this phase).
- **Deviations from the phase file:**
  - Added `src/lib/motion.ts` and `src/components/motion-provider.tsx`, and a `DESIGN.json` sidecar (not listed in the phase file) so Phases 7 to 9 get reduced-motion handling and shared easing without re-deriving them.
  - Non-`ui` shared components that carry emerald (navbar, footer, sidebar, user menu, credit display, auth forms) were left for their phases; they render emerald until then (list under Known issues).
  - No visual probes, no live interview (see Decisions).
- **Decisions made:** see Current state > Decisions (fonts, cool neutral hue, brand/primary alias, destructive vs brand, square badges and avatars, no live interview).
- **Phase-specific handoff items:** fonts, accent and neutral OKLCH values, token names, which DESIGN.md sections to read and the leftover emerald list are all under Current state > Design system (Phase 6) and Known issues.
- **How to verify this phase still works:** `npx tsc --noEmit`; `npm run build`; `grep -rn emerald src/components/ui` (expect nothing); `npm run dev` and open `/sign-in` in light and dark; check the network panel for two `woff2` requests.
- **Open issues / follow-ups:**
  - Phases 7 to 9: replace the leftover emerald and raw palette classes with tokens as each surface is rebuilt; delete the `--font-display` alias in `globals.css` when the marketing pages are rewritten.
  - Phase 7: the citation mark and figure row are specified in DESIGN.md Components but not yet built as React components; build them with the chat UI.
  - Phase 9: fix the em dashes in the metadata and copy; `viewport.themeColor` already matches the new paper colors.
  - Phase 10: `CLAUDE.md` Styling section.
- **Notes for the next session:** Phase 7 or 8 can start. Read `PRODUCT.md` and the DESIGN.md sections listed under Current state > Design system before building. The impeccable skill's `craft` step wants a confirmed shape brief per surface; the plan treats approval of the overall plan as that confirmation, as in this phase.

### Phase 7: assistant-ui chat and document viewer (2026-11-12)

- **Status:** done
- **Commit:** see the status table in README.md
- **What was built:**
  - `src/lib/chat/` (adapter, convert, citations, errors, feedback, highlight, history-adapter, runtime, session-store, thread-list-adapter) and `src/components/chat/` (component map under Current state > Chat UI and document viewer); `src/components/ui/popover.tsx`.
  - `src/app/(dashboard)/dashboard/chat/page.tsx` now only mounts `components/chat/chat-app.tsx` through `next/dynamic` with `ssr: false`.
  - `pdf-viewer.tsx` reworked: loads a URL or a Blob, opens at a page, marks a snippet on the text layer. `globals.css` gained `.cite-highlight`. `next.config.ts` is unchanged (the `canvas` alias for turbopack and webpack is still there).
  - Deleted: `components/dashboard/chat/{chat-input,chat-messages,chat-sidebar}.tsx` (the Phase 5 stopgap chat).
  - Packages added: `@assistant-ui/react`, `@assistant-ui/react-markdown`, `assistant-stream`.
- **Exit criteria** (verified with a scripted real-Chrome run against uvicorn + `next dev` + MinIO, the real model and a throwaway user, since deleted through `DELETE /api/account`; `npx tsc --noEmit` and `npm run build` are clean):
  - PASS: streaming, reasoning, tool traces, timestamps and metrics render live. Seen live: the "Working" indicator, a tool row with spinner then duration, a reasoning block open while streaming and collapsed once the answer starts, the answer with inline citation marks, the footer with time and TTFT / total / tokens per second (e.g. 5.8 s / 6.3 s / 21.2).
  - PASS: like and dislike (with reason chip and comment) persist and survive a reload (server returned `{rating: dislike, reason: inaccurate, comment}` and the button was pressed after reload). Copy: the button is rendered and wired to `ActionBarPrimitive.Copy`; it was **not clicked** in the run (headless clipboard).
  - PASS: a citation opens the viewer at the cited page with the passage marked on the PDF text layer (4 spans marked on the test PDF). A CSV citation opens the table plus the SQL that produced the answer. **Not exercised live:** the TXT view (scroll to the marked passage) and the DOCX note; they are covered by the same `findSnippet` code the PDF path uses but were not run.
  - PASS: document selection limits retrieval (a chat limited to `sales.csv` answered "I don't know" for a question about the other PDF, and `document_ids` was `[sales.csv]` on the session; switching to "All documents" on the existing chat saved `null` through `PATCH`); stop works (composer returns, "Stopped" note, the backend stored `incomplete`); rename survives a reload; delete (inline confirm) removes the session.
  - PASS: the zero-credit state: with the balance set to 0 after the page had loaded, sending showed "No message credits left" (not "No response"), nothing was charged and the credit display refreshed to 0 (after a few seconds, because of the remote DB); after a reload the banner is shown and the input is disabled. The balance was restored afterwards.
  - PASS (with scripted SSE bodies, not a real provider outage): a dropped connection shows "The connection dropped" with the partial text kept, and an `LLM_BUSY` error shows "The model is busy" with a retry button. A real flex-busy event was not provoked (flex is off by default).
  - PASS: mobile (390 px): chat list in a sheet, answer, and the viewer in a sheet (PDF/CSV). Dark mode checked at 1440 px.
- **Deviations from the phase file:**
  - Elements were not generated with `npx assistant-ui add thread`; see Decisions. The result is the same set of parts.
  - Added `assistant-stream` and `@assistant-ui/*` pinned as listed above.
  - The adapter's `generateTitle` waits for the backend's title instead of generating one (the backend already does).
- **Decisions made:** see Current state > Decisions (toolbar assumption confirmed, built from primitives, children render functions, no un-like, no archive, plain-text math, zero-credit behaviour).
- **Phase-specific handoff items:**
  - *Versions and API names actually used:* `useRemoteThreadListRuntime({ runtimeHook, adapter })` wrapping `useLocalRuntime(chatModel, { adapters: { feedback } })`; the per-thread `history` adapter comes from `unstable_useAdapters` on the thread-list adapter (the plan assumed a history adapter passed to the runtime directly). The first-message session id comes from `aui.threadListItem().initialize()` (the plan did not mention it). Citations are `source` parts with `sourceType: "document"` (the part type has no page or snippet field, so those ride in `providerMetadata`). `ThreadPrimitive.Messages` / `ThreadListPrimitive.Items` take a children render function. `metadata.timing` is the standard `MessageTiming`; the server timestamp, model and full metrics are in `metadata.custom`. The feedback adapter only receives `{message, type, comment}`, so the dislike reason is parked in a map by the popover (`stageDislikeReason`) right before it submits.
  - *Component map:* Current state > Chat UI and document viewer.
  - *What Phase 9 can reuse for the hero replay.* Presentational pieces that take plain props and need no runtime: `ReasoningView({ text, running })`, `ToolTraceRow({ name, args, result?: { ok, summary, duration_ms } })`, `MetricsRow({ metrics })` (a `MessageMetrics`), `CitationMark({ citation, onOpen? })`, `SourceChip`, `ChatErrorNotice({ error, onRetry? })`, and `DocumentViewer({ target, onClose })` with a `ViewerTarget` (`documentId, fileName, page, snippet, nonce`). The full message components (`UserMessage`, `AssistantMessage`, `AnswerText`, `MessageFooter`) read assistant-ui message state, so a replay should mount them inside an `AssistantRuntimeProvider` and `ViewerProvider` with static data: `useLocalRuntime(noopAdapter, { adapters: { history: { load: async () => repositoryFromMessages(staticMessages), append: async () => {} } } })`, where `staticMessages` is a `MessageOut[]` (the same shape `GET /api/sessions/{id}/messages` returns). **This static path was not built or run in Phase 7**; it is the intended recipe. `DocumentViewer` needs a real `/api/documents/{id}/content`, so a replay would need its own stub for the source step.
  - *Opening the viewer at a page / snippet:* `useViewer().openCitation(citation)`, or `openDocument(documentId, fileName, page?)`; the PDF component takes `initialPage`, `highlight`, `focusKey` (Current state).
  - *Stream events not handled:* none. Every event in chat-stream.md is consumed. `message.end.usage` is ignored (the UI shows `metrics`, which has the same totals).
- **How to verify this phase still works:** start MinIO, the backend (`uv run uvicorn app.main:app --port 8765` from `backend/`) and `npm run dev`; `npx tsc --noEmit`; `npm run build`; sign in with a verified user, upload a PDF, open `/dashboard/chat`, ask a question, open a citation. The scripted run used `playwright-core` with the system Chrome from a scratch folder (not in the repo).
- **Open issues / follow-ups:**
  - Backend prompt (Phase 3 file `backend/app/prompts.py`): add "write math in plain text, no LaTeX". The UI cleans the common cases, but the model should not emit it.
  - Citation pages are chunk-level (`page_start` of a chunk of about 1000 characters), so on a short document a citation can open at page 1 while the answer text says page 2, and the marked passage is the start of the chunk, not the exact sentence. Narrowing this would need the backend to return a better snippet (the matched sentence) or per-sentence pages.
  - A stopped first turn leaves an untitled session (the title is generated after a completed turn), shown as "New chat" in the list.
  - The first PDF open in `next dev` takes several seconds (the pdf.js worker compiles on demand); not measured in production.
  - Phase 8: `document-list.tsx` still previews through its own dialog with a Blob (still works because `PdfViewer` accepts a Blob); it can use `PdfViewer file="/api/documents/{id}/content"` or `DocumentViewer` instead. The shell (`sidebar`, `top-nav`, `credit-display`) still carries emerald. The chat page's outer box is `h-[calc(100dvh-8rem)]` inside the dashboard layout's `p-6` main; Phase 8 may want the chat to fill the main area.
  - Phase 8 / later: ratings cannot be removed from the UI (see Decisions).
- **Notes for the next session:** Phase 8 can start (Phases 5, 6 and 7 are done). The dev servers were stopped and the throwaway user deleted. Local MinIO is still running.

### Phase 8: Dashboard, settings and auth pages redesign (2026-11-12)

- **Status:** done, with the two flow gaps listed under Exit criteria (the emailed OTP and reset codes were not entered)
- **Commit:** f64fa10
- **What was built:**
  - Shell: `app/(dashboard)/layout.tsx`, `components/dashboard/{sidebar,top-nav,credit-display}.tsx`, `components/user-menu.tsx`, new `components/wordmark.tsx`. Credits once (sidebar), real breadcrumb, Help & Support to `/contact`.
  - Shared primitives: `components/app/{page-shell,tag,setting-row}.tsx`; helpers `lib/{format,credits,document-errors}.ts`; constants `SIGNUP_*_CREDITS`.
  - Overview: `app/(dashboard)/dashboard/page.tsx` (recent documents, recent activity from the ledger, 14-day usage strips, recent chats; a "Start with a document" state for a new account). No stat cards.
  - Documents: `components/dashboard/documents/{document-upload,document-list,use-upload-queue}.tsx`, `app/(dashboard)/dashboard/documents/page.tsx`; new `components/chat/viewer-dock.tsx` (shared by chat and documents). `pdf-viewer.tsx` is unchanged.
  - Settings: `app/(dashboard)/dashboard/settings/page.tsx`, `components/dashboard/settings/{profile,credits,account}-section.tsx` (new `account-section.tsx`: export and delete).
  - Auth: `components/auth/{auth-shell,auth-ui}.tsx` (new), all four forms, `otp-field`, `email-delivery-note`, and the four pages under `app/(marketing)/` now wrap in `AuthShell`. Behavior (OTP, Google, redirects, cooldowns, toasts) is unchanged.
  - Loading skeletons for the four dashboard routes; `chat-app.tsx` and the chat page placeholder sized to the new shell.
  - Edits to earlier phases' files: `globals.css` (type weight and tracking tokens), `ui/tabs.tsx` (brand underline), `chat/chat-app.tsx` (dock extracted, full-bleed).
- **Exit criteria:**
  - PASS: no raw palette classes in dashboard or auth components (`grep` above; the Google logo's four brand hex fills in `GoogleIcon` are the only hex values and are the mandated logo colors).
  - PASS: `npx tsc --noEmit` clean; `npm run build` succeeds (the first attempt hit a transient Windows `EBUSY` copying the standalone output right after the dev server was stopped; the retry was clean). The project has no ESLint config, so no lint run.
  - PASS (checked in real Chrome through Playwright against uvicorn + `next dev` + MinIO with a throwaway user): *light and dark* on the four auth pages, Overview (new and populated), Documents, Settings (Account in both; Profile and Credits in light only); *mobile (390 px)* on the four auth pages, Overview, Documents (list, viewer sheet) and the navigation sheet, and the Settings Account tab (Profile and Credits tabs not captured at 390); *keyboard*: tab order through the skip link, wordmark, nav, help link, breadcrumb, theme toggle, account menu and page actions; arrow keys move between Settings tabs; the inline delete confirmation takes focus on Cancel, and cancelling the account-delete panel returns focus to its trigger. Not driven by keyboard alone: the upload drop zone and the viewer sheet.
  - PASS: export. `/api/account/export` through the button downloaded `docgenie-export-2026-11-12.zip`; `zipfile.testzip()` is clean and it holds `account.json`, `documents.json`, `sessions.json`, `messages.json`, `feedback.json`, `credit_transactions.json` and the three originals.
  - PASS: delete. A wrong password showed "That password is not correct. Nothing was deleted." inline and removed nothing; the right password plus `DELETE` redirected to `/`, then `/dashboard` redirected to `/sign-in?redirect=%2Fdashboard`, `POST /api/auth/sign-in/email` with the old credentials returned 401 and there were 0 orphan `credit_accounts` rows. (Phase 5 already verified the backend data and MinIO prefix removal at the API level; the Google-only `SESSION_EXPIRED` branch was not exercised.)
  - PARTIAL: sign-up and forgot-password. Verified: sign-up reached `/verify-email?email=...&redirect=...`; a wrong code was rejected with "Invalid OTP" and the field cleared; sign-in with a verified user reached the dashboard; forgot-password reached the "Choose a new password" step. **Not verified:** entering a correct emailed code (verify or reset), because the codes are hashed at rest and only arrive by email. The forms' logic was not changed, only their markup and classes.
  - Documents flow, exercised live: five files at once (txt, csv, whitespace-only txt, an `.exe`, a 3-page PDF) gave Uploading rows, the `.exe` was Rejected locally ("Unsupported file type"), the whitespace file ended Failed with "No readable text found ... The credit was refunded." and a +1 refund row, the others reached Ready with page counts; a duplicate upload was Rejected ("Already in your library"); Open showed the PDF and CSV in the docked viewer; inline delete removed a document; the credit counts in the sidebar followed (5 to 2 after four accepted uploads and one refund). `refreshAll()` runs after every upload attempt and delete.
- **Deviations from the phase file:**
  - Added the shared primitives, the `viewer-dock` extraction and the type-token fix (see Decisions); the plan did not list them.
  - "Upload shows a status for each file" is implemented as one table with browser-side rows (see Decisions), not a separate tray.
  - The Settings tabs are Profile / Credits / Account (the plan only named the Account tab); "Credits & Messages" is shortened to "Credits".
  - Several uploads at once (the plan said "each file"): the input is `multiple` and the queue is sequential.
- **Decisions made:** see Current state > Decisions (plan as brief, one row per file, inline confirmations, chat fills main, type tokens, mono for numbers only, brand tab underline).
- **Phase-specific handoff items:**
  - *Where the `error_code` mapping lives:* `src/lib/document-errors.ts` (details under Current state > App surfaces).
  - *Layout primitives for Phase 9:* `PageShell`, `PageHeader`, `Section`, `SettingRow`, `Tag` / `StatusTag`, `Wordmark`, `AuthShell` (list under Current state > App surfaces). The grid language they share with the landing page is `page-container` + `page-grid` (12 columns from 768 px), hairline rules, left alignment, `ds-label` legends and `figure` numbers.
  - *Surfaces still on raw palette classes or old patterns:* marketing navbar, footer, landing, About, `not-found`, and the contact form (Phase 9; the sidebar's Help & Support opens that form). The marketing `--font-display` alias in `globals.css` is still there.
  - *Light/dark, mobile and keyboard results:* in Exit criteria above, with what was not covered.
- **How to verify this phase still works:** start MinIO, the backend (`uv run uvicorn app.main:app --port 8765` from `backend/`) and `npm run dev`; `npx tsc --noEmit`; `npm run build`; `grep -rE "\b(emerald|slate|zinc|gray|green|blue|amber|red)-[0-9]{2,3}\b|bg-white|text-white" src/components/dashboard src/components/auth src/components/app src/app/\(dashboard\)` (expect nothing). Sign up a throwaway user (`delivered+tag@resend.dev`), set `"emailVerified"` to true in `document_genie."user"`, sign in, upload a few files, open Settings > Account and download the export; delete the account from the same tab. The scripted run used `playwright-core` with the system Chrome from a scratch folder (not in the repo).
- **Open issues / follow-ups:**
  - `src/proxy.ts` only checks that a session cookie exists, so a stale cookie (for example after the account was deleted in another tab) renders the shell while every API call returns 401. Pre-existing from Phase 5; a server-side session check in the dashboard layout would close it.
  - Mobile shows the credit balances only inside the navigation sheet (they are shown once, in the sidebar). Revisit if that proves too hidden; the chat's zero-credit banner covers the case that matters.
  - The ledger and the Overview's "recent activity" list the signup grant as two rows (documents and messages), as the backend stores them.
  - Document rows on a narrow container stack with 44 px icon buttons (touch size), which is tall when the viewer is docked on a laptop. A `pointer: coarse` condition instead of the container width would tighten it.
  - Phase 9: the contact form and marketing chrome (see above); keep the privacy and FAQ claims true.
  - Phase 10: `CLAUDE.md` Styling section; the root README's n8n content.
- **Notes for the next session:** Phase 9 can start (it needs Phase 6; Phase 8's primitives are listed above). The dev servers were stopped and both throwaway users were deleted (one through the Settings UI, one by a cleanup script). Local MinIO is still running.

### Phase 9: Landing page, marketing pages and brand assets (2026-11-12)

- **Status:** done
- **Commit:** 0321edd
- **What was built:**
  - Landing page split into section components (map under Current state > Landing, marketing pages and brand): hero with a replay of a real recorded turn, a scroll-driven pipeline, limits table, under the hood, free preview, FAQ, closing CTA. Pro, Enterprise and "< 5 seconds" are gone.
  - Navbar rewritten (static, `NAV_LINKS`, inline mobile menu), footer simplified, new `MarketingPage` and `LegalPage` shells.
  - About, Contact (+ `contact-form.tsx` on tokens, progressive enhancement untouched), Privacy, Terms and the 404 restyled; legal copy and dates brought in line with the shipped features.
  - Brand: `lib/brand.ts`, `LogoMark` + `Wordmark`, `public/logo.svg`, `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, `themeColor` from `BRAND_HEX`, root metadata without em dashes. `--font-display` alias deleted.
  - Small edits to earlier phases: `MetricsRow` moved to `components/chat/metrics-row.tsx` (Phase 7), `lib/email.ts` (three em dashes), `lib/constants.ts` (+ `MAX_CSV_ROWS`, `OCR_MIN_CHARS_PER_PAGE`), `sitemap.ts` (+ `/contact`).
- **Exit criteria:**
  - PASS: every figure matches the backend config. Limits and credits come from `lib/constants.ts` (20 MB, 50 pages, 10,000 CSV rows, OCR below 25 chars/page, 5 + 25); the pipeline numbers were copied from `backend/app/config.py` by hand and re-read against it (not machine-checked).
  - PASS: hero replay and pipeline with motion and with reduced motion. Real Chrome through Playwright against `next dev`: the sequence ran to the finished turn (reasoning, tool call, streamed answer, citation, sources, timings, source excerpt); Replay restarts it; the citation mark toggles the source excerpt; with `reducedMotion: reduce` the finished turn shows at once, no Replay button, no hydration error. A first run found a hydration mismatch in the reduced-motion case (motion's hook answers on the first client render); fixed with `useReducedMotionSafe`. The pipeline's scroll rail was scrolled through but its fill was judged from a full-page capture, not frame by frame.
  - PASS: mobile menu opens, Escape closes it and returns focus to the button, a link click closes it and the anchor scrolls (`#limits`). `scrollWidth - clientWidth` was 0 at 1440, 768 and 390 px on the landing page and at 1440 and 390 px on About, Contact, Privacy, Terms and the 404.
  - PASS (structural; no official validator was run): the three JSON-LD blocks (Organization, SoftwareApplication, FAQPage) in the rendered HTML parse, carry `@context` and `@type`, the FAQ has 7 questions matching the visible ones one for one, and no stale claim (Pro, Enterprise, "< 5", 5 MB, 20 pages) appears. Not submitted to Google's Rich Results Test or validator.schema.org (no network use from the session).
  - PASS: no banned patterns. No raw palette classes, hex values, gradients, blur, `background-clip`, pills, centered stacks or em dashes in user-visible copy under `src`; headings are not restated beneath themselves.
  - PASS: `npx tsc --noEmit` and `npm run build` are clean (the first build hit the transient Windows `EBUSY` while the dev server was still stopping, as in Phase 8; the retry was clean). No ESLint config exists.
  - Not checked: no-JavaScript rendering of the landing reveals (the `<noscript>` rule is in the HTML but was not exercised in a no-JS browser); the contact form's no-JS POST (its logic is unchanged); the OTP-gated auth flows (unchanged since Phase 8).
- **Deviations from the phase file:**
  - Added `MarketingPage`, `LegalPage`, `landing/content.ts`, `useReducedMotionSafe`, `lib/brand.ts` and `public/logo.svg`; not listed in the plan.
  - The hero replay is built from the presentational chat components, not the assistant-ui static runtime the Phase 7 handoff suggested (that recipe was never run); this keeps the chat runtime out of the landing bundle. `MetricsRow` was moved to its own file for it.
  - The plan's "navbar gets a mobile menu" is an inline panel, not a sheet.
  - No visual mock step and no live shape interview (see Decisions).
- **Decisions made:** see Current state > Decisions (plan as brief, replay of a real recorded run, no pricing section and new anchors, static navbar, ink-only icons, legal copy, email dashes, About without a name).
- **Phase-specific handoff items:**
  - *Section component map:* Current state > Landing, marketing pages and brand.
  - *Brand asset files and logo source:* `src/lib/brand.ts` (colors + geometry), `src/components/wordmark.tsx`, `public/logo.svg`, `src/app/{icon,apple-icon,opengraph-image}.tsx`; `viewport.themeColor` in `src/app/layout.tsx`.
  - *JSON-LD validation result:* structural check passed (above); not run through an external validator.
  - *Copy or figures that need the user's input:* (1) the hero transcript is now fully real (re-recorded live at the user's request, 2026-11-12) but its timings are development-setup numbers; re-record after deployment if production is faster; (2) About has no author name, photo or link; (3) the OG image uses a default font; (4) Privacy and Terms were edited for accuracy, not reviewed by a lawyer.
- **How to verify this phase still works:** `npx tsc --noEmit`; `npm run build`; `npm run dev` (the landing needs no backend, only `DATABASE_URL` for the session check); open `/`, `/about`, `/contact`, `/privacy`, `/terms` and a missing path at 1440 and 390 px in light and dark; open the mobile menu; check `/icon`, `/apple-icon` and `/opengraph-image` return PNGs; `grep -rE "\b(emerald|slate|zinc|gray|green|blue|amber|red)-[0-9]{2,3}\b|bg-white|text-white|font-display" src` (expect nothing). The scripted run used `playwright-core` with the system Chrome from a scratch folder (not in the repo).
- **Open issues / follow-ups:**
  - Phase 10: `CLAUDE.md` still names the old anchors (`#features`, `#pricing`) and the emerald styling; the root README's n8n content.
  - Phase 11: set `NEXT_PUBLIC_*` as build-time vars; re-record the hero figures if wanted; check the OG image and `/logo.svg` on the real domain.
  - The landing's `PIPELINE_CONFIG` can drift from `backend/app/config.py` (no test).
  - The hero replay holds a 31 rem minimum height to avoid layout jumps; on a very short laptop viewport the panel extends below the fold until the sequence ends.
- **Notes for the next session:** Phase 10 can start. The dev server was stopped. Local MinIO and the backend were not used this phase.

### Phase 10: Documentation and full verification (2026-11-12)

- **Status:** done. Every check passed, with the gaps listed under Exit criteria ("Not exercised").
- **Commit:** see the status table in README.md
- **What was built:**
  - Docs: `CLAUDE.md` rewritten for the new architecture (the "Active rebuild" section is now a short "Rebuild status" that points only at Phase 11); root `README.md` rewritten (architecture, local setup with MinIO, `uv`, migrations, env tables for both apps, troubleshooting); `IMPLEMENTATION_PLAN.md` given a "historical" banner; `backend/.env.example` gained `ALLOWED_MIME_TYPES` and `DB_SCHEMA` (a script now confirms it lists every `Settings` field and nothing else); root `.env.example` already matched every `process.env` use in `src/`.
  - Polish fixes from the audit (see Decisions): `globals.css` (shadow tokens, `cite-highlight` color), `components/chat/{messages,reasoning-block}.tsx` (pulse mark), `components/marketing/legal-page.tsx` (underlined link), `components/app/setting-row.tsx` (h2), `app/(dashboard)/dashboard/chat/page.tsx` (sr-only h1), `.dockerignore`.
  - No backend code changed.
- **Exit criteria:**
  - PASS: **backend suite, 193 passed in 13 min 16 s** (real Postgres in a throwaway schema, local MinIO). It covers every plan item: concurrent reservation without double spend, 0 credits rejected, refund on failure; duplicate upload, size, page and row limits, type sniffing; hybrid search returning keyword-only and semantic-only matches; `sql_guard` rejecting writes, other tables and multiple statements; cross-user denial on every endpoint; cascade delete removing the MinIO object; the stream contract.
  - PASS: **`npx tsc --noEmit`** clean; **`npm run build`** clean (twice: before the run and after the polish edits).
  - PASS: **`n8n` in `src/`**: only `lib/n8n.ts`, `app/api/contact/route.ts` and one sentence in the privacy copy (the contact form stays on n8n, Phase 4 decision).
  - PASS: **end to end, locally** (real OpenAI and MinIO, a fresh Better Auth user created through the sign-up form, Chrome driven by Playwright; the scripts lived in the session scratchpad, not the repo):
    1. Sign-up reached `/verify-email`; after marking the address verified in the database (the emailed code is hashed and cannot be read back) sign-in worked; the sidebar and `/api/dashboard` showed **5 documents and 25 messages**.
    2. Upload through the UI of a text PDF, a scanned PDF, a DOCX, a CSV, a 21 MB file and a 60-page PDF, all at once: the first four reached **ready in 32 s total** (scanned PDF `ocr_used=true`, 2 pages; CSV 8 rows, 4 columns); the 21 MB file was **Rejected "Over 20 MB"** and the 60-page file **Rejected "More than 50 pages"** (a backend 400); the 21 MB file sent straight to `/api/documents` returned `413 FILE_TOO_LARGE`. Credits went 5 to 1 (four spent, the rejects free).
    3. Chat: one chat per document type, each limited with the document picker. All four answers were correct and cited (60 days / 1.5 %, 14 pallets in aisle 7, Marisol Vega / 240,000 dollars, East highest at 7,800 from a real `query_table` SQL). Each showed the tool row with timing, a timestamp, the sources chip, and first-token / total / tokens-per-second (3.6 to 7.2 s first token on the remote-DB dev setup). Streaming: the answer text was sampled growing across several distinct lengths. **Copy** put the Markdown answer on the clipboard; **like** and **dislike with a reason chip and a comment** were saved (the API returned `like` and `dislike/inaccurate/"e2e comment"`). **Citation click-through**: on a 10-page handbook the answer to a question about page 7 cited `p.7`, the viewer opened on `7 / 10` with 3 spans marked (the 3-page contract opens on page 1 because its one chunk spans pp.1-3, the known chunk-level limit). **Stop** mid-answer: "Stopped" note, composer back, session stored as `incomplete`. **Document selection**: a chat limited to `sales.csv` answered "I don't know" to a question about the PDF. **Rename** persisted across a reload; **delete** (inline confirm) removed the session.
    4. **Zero credits**: after spending the last two credits the sidebar showed "None left: 0", the composer was disabled with "No message credits left" and a "View credits" link, and `POST /api/chat` returned `402 INSUFFICIENT_CREDITS` with nothing charged.
    5. **Export then delete** through Settings > Account: the zip passed `testzip`, held 5 originals **byte-identical** to the uploads plus `account.json`, `documents.json`, `sessions.json` (7), `messages.json` (16), `feedback.json` (2) and `credit_transactions.json` (16), matching the database. Deleting (password + `DELETE`) redirected to `/`; the counts before were 5 documents / 37 chunks / 8 rows / 7 sessions / 16 messages / 2 feedback / 16 ledger / 28 usage / 1 account and 5 MinIO objects, and **every one was 0 afterwards, including the three Better Auth tables and the MinIO prefix**; `/dashboard` redirected to sign-in and the old credentials returned 401.
  - PASS (after fixes): **light and dark, 1440 / 768 / 390 px, 12 routes (60 combinations)**: no horizontal overflow anywhere; axe-core (4.10.2) reported only the items fixed below; the last run's three findings are the loading-skeleton h1 (see Open issues). Reduced motion: no console errors and no infinite animations on the landing page or chat. Keyboard: tab order is logical on both (skip link, wordmark, nav, controls); focus rings now show on every control (see the fix).
  - PASS: **production build** served with `next start`: **108 page loads** of the public pages in light, dark, 390 px and reduced motion gave **0 hydration warnings** (the dev server showed one twice in 60 combinations and never again in 115 more loads, so it was a dev-mode artifact; the only other console errors were the 12 expected 404s of the `/nope` page).
  - PASS: **impeccable audit and polish** on the landing page and the chat (non-interactive; PRODUCT.md and DESIGN.md as the brief). Anti-pattern grep (gradients, blur, side stripes, pills, raw palette classes, hex values, em dashes) found nothing in those surfaces. Defects found and fixed: focus ring missing app-wide (P1), hero excerpt contrast 3.9:1 (P1), legal link distinguished by color only (P1), no h1 on the chat page (P2), heading order on Settings (P2), text-opacity pulses (P2). Rescans after the fixes were clean for the landing page in both themes.
  - **Not exercised:** the contact form (a real submission would call the live n8n webhook); Google sign-in; entering an emailed OTP or reset code (set verified in the database instead); a live reasoning block in this run (the four questions were easy, so the model produced no reasoning summary, which the contract allows; reasoning was verified live in Phases 3 and 7 and is on the landing hero); a flex-tier failure live; the document viewer's TXT and DOCX views; keyboard-only use of the upload drop zone; the production build with the backend attached (only public pages were served in production mode).
- **Deviations from the phase file:**
  - The "impeccable audit + polish" ran in a non-interactive session with PRODUCT.md and DESIGN.md as the brief; its audit was code-level (the skill's `audit` reference: axe, measured targets, focus, reduced motion, anti-pattern grep) plus a look at screenshots. No separate `critique` was run.
  - The e2e step "spend all message credits" used a database shortcut for the first 23 (see Decisions).
  - Fixed small defects in Phase 6 to 9 files (listed above), which the phase file allows ("any failures are fixed or listed").
- **Decisions made:** see Current state > Decisions (the six Phase 10 entries).
- **Phase-specific handoff items:**
  - *Test results:* above. No failures remain open; the failures found (focus ring, contrast, link, headings) were fixed and re-measured.
  - *Production env var list* (Phase 11's main input; names only, values live in `backend/.env`, root `.env.local` and Coolify). **Never quote values in Coolify.**

    **Backend** (new Coolify app from `backend/Dockerfile`, port 8000, internal network only, no public domain; **all runtime**, nothing is build-time):

    | Var | Notes |
    |---|---|
    | `DATABASE_URL` | same Postgres as Better Auth, `postgres://` form is fine; **required** |
    | `OPENAI_API_KEY` | **required** |
    | `INTERNAL_API_KEY` | **required**; must equal the frontend's |
    | `S3_ENDPOINT` | internal MinIO URL (`http://<minio service name>:9000`); **required** |
    | `S3_BUCKET` | `docgenie`; **required** |
    | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | the bucket-scoped MinIO user; **required** |
    | `S3_REGION` | any dummy region, e.g. `us-east-1` (path-style addressing is already in the code); **required** |
    | `LLM_INPUT_PRICE_PER_M`, `LLM_OUTPUT_PRICE_PER_M` | optional; unset means `llm_usage.cost_usd` is NULL (the user has not supplied `gpt-6-luna` prices) |
    | `CHAT_SERVICE_TIER` and every other tunable | optional; defaults in `backend/app/config.py`, override lines in `backend/.env.example`. Leave `CHAT_SERVICE_TIER` unset (`default`) |

    **MinIO** (Coolify service, no public domain, on the shared `coolify` network): its own root user and password (not in the repo), the private bucket `docgenie`, and a bucket-scoped access key that becomes `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. No bucket policy for anonymous access: the backend streams the files and issues no presigned URLs.

    **Frontend** (the existing Coolify app, root `Dockerfile`, port 3000):

    | Var | Build-time? | New? |
    |---|---|---|
    | `BACKEND_API_URL` (internal URL of the backend app, no trailing slash) | runtime | **new** (the Phase 11 file calls it `BACKEND_URL`; the code reads `BACKEND_API_URL`) |
    | `INTERNAL_API_KEY` | runtime | **new** |
    | `NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | **build-time** (Dockerfile `ARG`s) | existing |
    | `DATABASE_URL` | **build-time and runtime** (project rule) | existing |
    | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the production origin, no trailing slash), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | runtime | existing |
    | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | runtime | existing |
    | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | runtime | existing (contact form only) |
    | `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_CONTACT_FORM_WEBHOOK_ID` | runtime | existing, **keep** (the contact form stays on n8n) |
    | `N8N_INGESTION_WEBHOOK_ID`, `N8N_AI_ASSISTANT_WEBHOOK_ID`, `N8N_TITLE_GENERATOR_WEBHOOK_ID`, `N8N_ANALYTICS_WEBHOOK_ID`, `N8N_CREDITS_WEBHOOK_ID`, `N8N_DATA_WEBHOOK_ID`, `N8N_DELETE_WEBHOOK_ID`, `N8N_PREVIEW_DOCUMENTS_WEBHOOK_ID`, `N8N_ADD_REACTION_WEBHOOK_ID` | | **remove** |

    `COOLIFY_API_TOKEN` / `COOLIFY_DEPLOY_TOKEN` are GitHub / local deploy secrets, not container env.
  - *Production migration steps, in order:*
    1. **Check where the production database is before doing anything.** `backend/.env`'s `DATABASE_URL` points at the shared VPS Postgres, and Phases 1 to 4 already ran `alembic upgrade head` against it (head `0003`) and dropped the old app tables. If production's `DATABASE_URL` is the same database, the migrations are already applied and the live n8n site's data features have been broken since 2026-11-11. Run `uv run alembic current` against it: expect `0003 (head)`.
    2. Back up the `document_genie` schema (`pg_dump -n document_genie`) before any change. The Better Auth tables (`user`, `session`, `account`, `verification`) must stay untouched.
    3. If not at head: `uv run alembic upgrade head` (from `backend/` with the production `DATABASE_URL`). pgvector must be 0.8 or newer (the retrieval query sets `hnsw.iterative_scan`); the dev server has 0.8.1 in schema `public`.
    4. `PYTHONPATH=. uv run python scripts/regrant_signup_credits.py --dry-run`, then without `--dry-run`, for any user created while the old site was live. It is idempotent (it granted 4 users on 2026-11-11, and a second run granted 0). New users are covered by the signup hook and by the lazy grant.
    5. Create the MinIO service, bucket and bucket-scoped key; set the backend env; deploy the backend; check the container health (`GET /v1/health` needs `X-Internal-Key`: a bare `curl` gets a 401, and the slim Python image has no `curl`, so rely on the `HEALTHCHECK` in `backend/Dockerfile`, which sends the key with Python, or add `curl` and the header if Coolify's own health check is used).
    6. Set the frontend env (`BACKEND_API_URL`, `INTERNAL_API_KEY`, remove the nine dead `N8N_*`), then deploy by pushing to `main`. The rotated `N8N_API_KEY` (set in Coolify on 2026-11-11) only takes effect on this deploy.
    7. Smoke test: sign up, upload, chat with a citation, delete the account, send a contact message.
  - *Corrections to the Phase 11 file:* `BACKEND_URL` is `BACKEND_API_URL`; the contact workflow stays on n8n, so **7 of the 8 workflows** are retired, not all 8, and "the rotated n8n key is no longer used anywhere" means "the old key": the new one is still used by the contact route.
  - *`CLAUDE.md` rewritten and "Active rebuild" reduced to Phase 11:* yes. The section is now "Rebuild status" and names only Phase 11 (deployment, needs the user's confirmation). Phase 11 removes it when it finishes.
- **How to verify this phase still works:** MinIO up; `cd backend && uv run alembic current` (expect `0003`); `uv run pytest -q` (193 passed, about 13 min); from the repo root `npx tsc --noEmit` and `npm run build`; for the end to end, start the backend (`uv run uvicorn app.main:app --port 8765`) and `npm run dev`, sign up a throwaway `delivered+tag@resend.dev` user and set `"emailVerified"` true in `document_genie."user"`.
- **Open issues / follow-ups:** see Current state > Known issues: no title if the client disconnects right after the answer (backend, small fix); the loading skeletons have no h1; small touch targets (documented, not a defect under WCAG 2.2 AA); the stray `docgenie_test_1b4ffeb9` schema (drop it); the About page still has no author; model prices still unknown; hero figures to refresh after deployment.
- **Notes for the next session:** Phase 11 may start only after the user confirms. Read this entry's env list and migration steps first. The dev servers (3000, 3001, 8765) are stopped, the throwaway user and every row and object it created are deleted (including its `verification` row), and local MinIO is still running.

### Phase 11: Deployment to Coolify (2026-11-12)

- **Status:** done. (First written as partial on 2026-11-12 with the n8n step open; closed the same day, see "n8n retirement" below.)
- **Commit:** deployed code = merge commit `32ef359` on `main` (21 commits pushed); documentation `bb10062`; the closing documentation edits (n8n retirement, rebuild marked complete) are a later docs-only commit.
- **What was built / done:**
  1. Read-only checks: SSH and the Coolify API work; production `DATABASE_URL` equals the one in `backend/.env` (same Postgres), and `alembic current` = `0003 (head)`, so the migrations were already applied by Phases 1 to 4 and nothing was run against the database. The re-grant script dry run: 4 users, 0 without a credit account, so it was not run for real.
  2. Backup of the `document_genie` schema on the VPS (path under Production above).
  3. **MinIO**: Coolify service `docgenie-minio`, official `minio/minio:latest`, on the `coolify` network, private bucket `docgenie`, bucket-scoped user. Provisioned with the skill's script, adapted (credentials to a local file instead of stdout; bucket and user created with `docker exec ... mc` because `minio/mc` is no longer pullable).
  4. **Backend**: Coolify app `docgenie-api` from `backend/Dockerfile`, no domain, alias `docgenie-api`, runtime-only env. Healthy on first start; `/v1/health` shows database and storage `ok`.
  5. **Frontend env**: added `BACKEND_API_URL` and `INTERNAL_API_KEY`, deleted nine dead `N8N_*` vars (prod and preview).
  6. **Deploy**: after a second approval from the user, pushed `main`; the GitHub Action triggered Coolify, and the build finished and the container started.
  7. **Production smoke test** (script in the session scratchpad, not the repo; real public site, real OpenAI, throwaway user `delivered+docgenie-smoke-<tag>@resend.dev`): sign-up, sign-in (email marked verified in the database as in Phase 10), dashboard with 5 + 25 credits, upload of a 2-page PDF (ready in 3 s), original streamed back from MinIO, chat over SSE (events `message.start > tool.start > tool.end > text.delta > citation > message.end > session.title`; answer "45 days" with a citation to the uploaded file; session titled; 1 message credit spent), document delete (204, then 404), contact form (`{"success":true}`, so the rotated `N8N_API_KEY` works), account delete (every row 0, including the Better Auth `user`; MinIO bucket 0 objects; old cookie 401). 20 of 20 checks passed. The first run's "no MinIO objects" check was a false pass (`mc` was denied); it was redone with the root key: 0 objects.
- **Exit criteria:**
  - PASS: production health check is green for database and storage.
  - PASS: production smoke test.
  - PASS: **the seven DocGenie n8n workflows are deactivated** (see "n8n retirement" below).
- **n8n retirement (2026-11-12, after the entry above was first written):** the user deactivated the seven workflows in the n8n UI and restarted n8n. Checked afterwards from the VPS: `n8n list:workflow --active=true` shows exactly one DocGenie workflow, `DocGenie Contact Form` (`A614gG19S0zm0wd7`), and 40 active workflows in total (the contact forms of other apps are among them); a live `POST /api/contact` returned `{"success":true}`; the site returns 200. The old rotated n8n key is no longer used by any DocGenie workflow, and the current `N8N_API_KEY` is used only by the contact route.
- **Deviations from the phase file:**
  - `BACKEND_URL` is `BACKEND_API_URL` (as the Phase 10 handoff said).
  - 7 of the 8 workflows are to be retired, not 8: the contact workflow stays (confirmed with the user at the start of this session).
  - Health check via the Dockerfile `HEALTHCHECK`, not `curl` (see Decisions).
  - Database step: no migration was needed (already at head), and no re-grant was needed.
- **Phase-specific handoff items:**
  - Coolify names and UUIDs, internal hostnames: see "Production (Phase 11)" in Current state.
  - Production smoke-test result: above.
  - n8n deactivation date: 2026-11-12.
  - "Rebuild status" section removed from `CLAUDE.md`; the rebuild is marked complete in `docs/plan/README.md` and the root `README.md`.
- **How to verify this phase still works:** `https://docgenie.zeeshanai.cloud` loads and `/api/dashboard` returns 401 signed out. On the VPS: `docker run --rm --network coolify curlimages/curl -sS -H "X-Internal-Key: <key>" http://docgenie-api:8000/v1/health` shows both checks `ok`, and the same URL without the header is 401. `docker ps` shows the three containers healthy/up.
- **Open issues / follow-ups:**
  1. ~~Deactivate the seven n8n workflows~~ **Done** (Ingestion `GmztVC5kd8ZyBKXA`, Credits `sBUF2ZYdSfhzVMeA`, Data `dcoNTj1LyC1W9c1c`, Delete `f3p0Xr6pWSOE9yYI`, Analytics `XHITQ9v3uBNgBcRb`, AI Assistant `EzZYD6pSIcL8ylYr`, Title Generator `pkzNR7H8aVPW5vbH`). They are inactive, not deleted, so they can be switched back on. `Text Token Calculation` (`HW5byLzF2bUD2FfV`) was already inactive. The repo's `N8N_API_KEY` is the webhook header key and cannot call the n8n public API.
  2. ~~Backend auto-deploy~~ **Done after Phase 11**: `deploy-backend.yml` (path-filtered to `backend/**`) plus migrate-on-start in `backend/Dockerfile`. Tested locally: migrate no-op then uvicorn as PID 1; an unreachable database exits with code 1 and serves nothing.
  3. The hero replay figures (`hero-replay.tsx`) are still the development numbers. In production the smoke-test chat turn (one tool call and a citation) took 13.9 s end to end; the backend reaches Postgres through the VPS public address, which is worth tuning (docker0 gateway) before re-capturing the figures.
  4. Production and local development share one Postgres, so a local test run touches the production server (pytest uses a throwaway schema; `alembic upgrade head` does not).
  5. The stray schema `docgenie_test_1b4ffeb9` is still on that database (drop it when convenient).
- **Notes for the next session:** none required; the rebuild is complete. The "After this plan" recommendations in the phase file are not in scope. A secret-handling slip happened in this session: one Coolify API response echoed the backend's env values (database URL, OpenAI key, the new internal key and MinIO key) into the session output. They were not written to any file in the repo. If that transcript is treated as exposed, rotate the OpenAI key and the database password; the new internal key and MinIO key can be rotated in Coolify without data loss.

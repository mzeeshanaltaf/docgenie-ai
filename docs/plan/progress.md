# DocGenie rebuild: progress and handoff log

Read the protocol in [README.md](README.md) first. This file has two parts:

1. **Current state:** always up to date. Each session rewrites it at the end so it matches the repo at that point.
2. **Phase log:** one entry per finished (or partial) phase, appended in order and never rewritten afterwards.

No secrets anywhere in this file: record env var names and where their values live.

---

## Current state

_Last updated by: Phase 6 (done)_

### How to run locally
- Frontend: `npm run dev` (localhost:3000). Needs the backend running and `BACKEND_API_URL` + `INTERNAL_API_KEY` in root `.env.local` (Phase 5). Full local stack = MinIO container + `uv run uvicorn app.main:app --port 8765` + `npm run dev`.
- MinIO (from the repo root): `docker compose --env-file backend/.env -f docker-compose.dev.yml up -d` (starts container `docgenie-dev-minio` and a one-shot job that creates the private buckets `docgenie` and `docgenie-test`; the root credentials and bucket name are read from the `S3_*` values in `backend/.env`, so the app and MinIO cannot drift; same layout as the ResuMatch / DocuMind dev setups). Stop with `docker compose -f docker-compose.dev.yml down` (data stays in the `docgenie-minio-data` volume). Production MinIO is a dedicated Coolify service, provisioned in Phase 11 like ResuMatch (`resumatch-minio`: no public domain, `coolify` network, bucket-scoped user).
- Backend (from `backend/`):
  - install: `uv sync`
  - run: `uv run uvicorn app.main:app --port 8765`
  - migrate: `uv run alembic upgrade head` (head `0003`: `0002` allowed the `incomplete` chat message status; `0003` dropped the unused `contact_submissions` table; both applied to the shared database on 2026-11-12)
  - NOTE: port 8000 on the dev machine is occupied by an unrelated process; use `--port 8765` (or any free port)
  - tests: `uv run pytest -q`. Needs the MinIO container above and `DATABASE_URL` in `backend/.env`. Takes about 4 minutes because the DB is the remote VPS (about 1 s per round trip); the 40 unit tests alone (`uv run pytest tests/test_parsing_chunking.py tests/test_auth_and_errors.py tests/test_config.py -q`) take under a second. If the DB or MinIO is unreachable the integration tests skip instead of failing.
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
| Chat/agent tunables: `AGENT_MAX_STEPS` (8), `HISTORY_WINDOW` (20), `RETRIEVAL_TOP_K` (8), `RETRIEVAL_CANDIDATES` (30), `RRF_K` (60), `SNIPPET_CHARS` (240), `DOC_TEXT_MAX_TOKENS` (25000), `QUERY_MAX_ROWS` (100), `QUERY_TIMEOUT_MS` (5000), `TOOL_RESULT_MAX_CHARS` (24000), `TITLE_MAX_CHARS` (60) | backend | defaults in `backend/app/config.py` | 3 |
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

### Decisions made during implementation
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
- **Leftover emerald and old styling outside `src/components/ui` (Phase 6 handoff):** the shared primitives are clean, but these still carry `emerald-*` (and other raw palette classes) and render emerald until their phase rewrites them: `components/auth/{auth-form,forgot-password-form,otp-field,verify-email-form}.tsx`, `components/contact/contact-form.tsx`, `components/dashboard/{sidebar,credit-display}.tsx`, `components/dashboard/chat/{chat-input,chat-messages,chat-sidebar}.tsx`, `components/dashboard/documents/document-upload.tsx`, `components/dashboard/settings/{credits-section,profile-section}.tsx`, `components/user-menu.tsx`, `components/marketing/{navbar,footer}.tsx`, `app/(dashboard)/dashboard/page.tsx`, `app/(marketing)/{page,about}/page.tsx`, `app/not-found.tsx`. Phases 7 and 8 own the app and auth ones, Phase 9 the marketing ones (navbar and footer are shared by Phases 8 and 9). The marketing pages also use `var(--font-display)` with an italic style; it is aliased to the sans in `globals.css` (`body { --font-display }`) so they still render, with a synthesized italic. Delete the alias when those pages are rewritten.
- **`CLAUDE.md` "Styling" section still describes the emerald classes** (Phase 10 rewrites it).
- **Root layout `<title>` and the marketing copy still contain em dashes** ("DocGenie — Chat With Your Documents", etc.); DESIGN.md forbids them. Phase 9 rewrites that copy and the metadata.
- **Legal copy fixed after Phase 5 (2026-11-12):** the privacy page now describes OpenAI processing (questions, passages, embeddings, titles, scanned-page images; sent with storage disabled), Resend, Upstash and the self-hosted n8n contact workflow, stored data and deletion, with one consistent "last updated" date; the landing FAQ and About line that said data is "never shared with third parties" were corrected. The terms needed no change. Phase 9 should keep these claims true when it rewrites the marketing pages.
- **Root `README.md` still documents the n8n architecture and env vars** (Phase 10 rewrites docs); `CLAUDE.md`'s n8n sections are stale until then too.
- **Coolify still holds the removed `N8N_*` vars** and has no `BACKEND_API_URL` / `INTERNAL_API_KEY` (Phase 11).
- **Flex tier** is opt-in (`CHAT_SERVICE_TIER=flex`); the fallback retry on `FLEX_FALLBACK_TIER` is implemented (Phase 3). Measured live (Phase 3, 27 flex calls with a trivial one-word prompt): 6 to 15 s per call (default tier: about 1 to 2 s per model call), and "Flex processing is temporarily unavailable" showed up once (4 of 5 in the Phase 1 probe, so the rate varies a lot). It arrives either as an HTTP 429 at request time or, as seen in that one case, as an `APIError` from inside the open stream about 1.7 s in; the retry handles both when no content has been streamed yet. The in-stream shape was only reproduced with a fake in tests (the live fix was not re-observed because the unavailability did not recur in the 21 calls after it). Not recommended as the default for an interactive chat.
- **`gpt-6-luna` prices are still unknown** to the repo, so `llm_usage.cost_usd` is `NULL` for chat, title and OCR. Set `LLM_INPUT_PRICE_PER_M` / `LLM_OUTPUT_PRICE_PER_M` in `backend/.env` (the user has to supply them); nothing else needs to change.
- **Latency on the dev setup:** `message.start` arrives about 2 to 4 s after the request because `prepare_turn` makes roughly 8 round trips to the remote VPS database (about 1 s each). With the database next to the backend (production) this is a few tens of ms. The same remote latency inflates `search_documents` (about 3 to 5 s) and therefore `ttft_ms`.
- **Reasoning summaries are optional**: easy questions often produce none (`reasoning_tokens` 0). The UI must not wait for or require them; they come as Markdown with a bold heading line.
- **A turn that is cut off mid-tool-call** keeps the user message and an `incomplete` assistant message; there is no "resume". If the backend process itself is killed mid-stream, no assistant row is written and the reserved credit is not refunded (no sweep exists for chat, unlike ingestion). Rare; revisit if it ever matters.
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
- **Commit:** not committed
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


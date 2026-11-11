# DocGenie rebuild: progress and handoff log

Read the protocol in [README.md](README.md) first. This file has two parts:

1. **Current state:** always up to date. Each session rewrites it at the end so it matches the repo at that point.
2. **Phase log:** one entry per finished (or partial) phase, appended in order and never rewritten afterwards.

No secrets anywhere in this file: record env var names and where their values live.

---

## Current state

_Last updated by: Phase 1 (done)_

### How to run locally
- Frontend: `npm run dev` (localhost:3000)
- Backend (from `backend/`):
  - install: `uv sync`
  - run: `uv run uvicorn app.main:app --port 8000`
  - migrate: `uv run alembic upgrade head` (head `0001`, applied to the shared DB on 2026-11-11)
  - NOTE: port 8000 on the dev machine is occupied by an unrelated process; Phase 1 was verified on `--port 8765`
  - tests: `uv run pytest -q` (20 pass, no DB needed)
  - model smoke test: `PYTHONPATH=. uv run python scripts/smoke_models.py` (and `scripts/smoke_flex_probe.py`)
  - read-only DB inspection: `PYTHONPATH=. uv run python scripts/inspect_db.py [table ...]`
- MinIO: _not set up yet_

### Services and ports
| Service | Port | Notes |
|---|---|---|
| Next.js dev | 3000 | |
| FastAPI backend | 8000 | private; every `/v1` route needs `X-Internal-Key` |

### Env vars (names only)
| Var | Used by | Where the value lives | Added in phase |
|---|---|---|---|
| _existing vars are listed in `CLAUDE.md`_ | | | |
| `DATABASE_URL`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `INTERNAL_API_KEY` | backend | `backend/.env` (gitignored; seeded from root `.env.local`, `INTERNAL_API_KEY` generated) | 1 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `CONTACT_NOTIFY_EMAIL` | backend | declared in `app/config.py` + `backend/.env.example`, not set yet | 1 |
| All tunables (`CHAT_MODEL`, `MAX_UPLOAD_MB`, `CHUNK_SIZE`, ...) | backend | defaults in `backend/app/config.py`; list in `backend/.env.example` | 1 |
| `INTERNAL_API_KEY` (same value) | Next.js proxy | must be added to root `.env.local` in Phase 5 | 5 |

### Contracts later phases rely on
- **Raising errors:** `from app.errors import ApiError, ErrorCode`; `raise ApiError(ErrorCode.INSUFFICIENT_CREDITS)` (optional `message=`, `details=`). Body is `{success:false, status:<CODE>, message, details}`. Codes and HTTP map: `backend/app/errors.py`.
- **Auth deps:** `verify_internal_key` is applied to the whole `/v1` router in `app/main.py`. User-scoped routes take `user_id: CurrentUserId` (`from app.deps import CurrentUserId`; `current_user_id` is the underlying dependency). New routers are added via `v1.include_router(...)` in `create_app()`.
- **DB:** `app.db.get_session` (FastAPI dependency, AsyncSession), `Base` (metadata schema `document_genie`). Models in `backend/app/models/`. Search path is `document_genie,public`.
- **LLM:** `app.services.llm.respond(...)` is a thin non-streaming Responses wrapper; `PRICING` in `app/config.py` is empty and must be filled before cost logging means anything.

### Decisions made during implementation
- `gpt-6-luna` confirmed for flex tier, `reasoning.effort=medium`, reasoning summaries and image input (see Phase 1 log). Assumption closed.
- **Service tier default changed from `flex` to `default` (user decision, 2026-11-11)** because flex 429s often. `CHAT_SERVICE_TIER=flex` remains an opt-in env override; `FLEX_FALLBACK_TIER` only matters in that case. Phase 3 should still catch the flex 429 and fall back if flex is ever enabled.
- `/v1/health` also requires `X-Internal-Key` (plan: every request). The Dockerfile health check sends it.
- `user_id` columns are `text` with no FK to Better Auth's `user` table (its id is `text`); Phase 4 account deletion must delete by `user_id`.
- Alembic's version table is `document_genie.alembic_version` (the server is shared; other schemas have their own).
- Added `CHECK (balance >= 0)` on credit accounts as a race backstop.
- Python deps pinned by `backend/uv.lock`; Python 3.12 only.

### Known issues and deferred work
- Flex tier returns intermittent `429 Flex processing is temporarily unavailable` (4 of 5 tries in one probe). Default tier is now `default`; if flex is re-enabled, Phase 3 must implement the `FLEX_FALLBACK_TIER` retry.
- Existing users have no row in the new `credit_accounts` (old balances dropped with the old table). Phase 2 should create the account lazily with the signup grant if missing (or a one-off backfill).
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

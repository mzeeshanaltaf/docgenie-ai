# DocGenie

**Live App:** [https://docgenie.zeeshanai.cloud](https://docgenie.zeeshanai.cloud)

Upload PDF, DOCX, TXT or CSV files and ask questions about them in plain language. Answers stream in with the model's reasoning summary and the tools it used, and every claim carries a citation that opens the source page with the passage marked.

> **Deployment status:** the rebuilt system (FastAPI backend, MinIO storage, new UI) has been live in production since 12 November 2026, and the old n8n workflows are retired except the contact form (history: [docs/plan/](docs/plan/README.md)).

## Features

- **Documents:** PDF, DOCX, TXT and CSV up to **20 MB and 50 pages** (CSV up to 10,000 rows). Scanned PDFs are read with OCR. Duplicate files are rejected. Originals are kept in private object storage and can be opened or downloaded.
- **Chat:** streamed answers with reasoning summaries, tool traces, citations that open the page in a side viewer, per-chat document selection, stop, retry, rename and delete, copy / like / dislike (with a reason), and per-answer timing (first token, total, tokens per second).
- **CSV questions** are answered with read-only SQL that passes a strict validator (`backend/app/services/sql_guard.py`), not with free model-written queries.
- **Credits:** 5 document credits and 25 message credits on signup, 1 per upload and 1 per chat turn. Failed uploads and answer-less turns are refunded. There is no way to buy more.
- **Account:** self-service export (a zip of metadata, chats and the original files) and immediate deletion of every row and file.
- **Auth:** email and password with a 6-digit email code, plus Google sign-in (Better Auth).

## Architecture

```
Browser
  └─ Next.js 16  (UI, Better Auth, routing)
       └─ src/app/api/**   thin proxies: session -> X-Internal-Key + X-User-Id
            └─ FastAPI backend (private, never public)        backend/
                 ├─ Postgres  schema document_genie  (pgvector; app tables via Alembic)
                 ├─ MinIO     originals, key users/{user_id}/{document_id}/{file_name}
                 └─ OpenAI    Responses API: chat agent, titles, OCR, embeddings
```

- **Next.js** only handles routing, auth and UI. It resolves the Better Auth session and forwards each request to the backend with a shared secret (`X-Internal-Key`) and the user id (`X-User-Id`). The browser never talks to the backend.
- **FastAPI** owns credits, ingestion (parse, OCR, chunk, embed), hybrid retrieval (pgvector cosine + Postgres full text, fused with reciprocal rank fusion), the agent loop, the dashboard and account endpoints. Every query is scoped by the user id.
- **Chat** streams as server-sent events from the backend, piped unchanged through `POST /api/chat` and consumed by an assistant-ui adapter. The wire format is documented in [backend/docs/chat-stream.md](backend/docs/chat-stream.md).
- **Contact form** is the one workflow still on n8n; transactional auth email goes through Resend.

Design rules for the UI are in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md).

## Tech stack

| Area | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui primitives, assistant-ui, react-pdf, motion |
| Auth and email | Better Auth (email OTP + Google, Postgres), Resend |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2 (async, asyncpg), Alembic, uv |
| Data | Postgres with pgvector, MinIO (S3 API) |
| AI | OpenAI Python SDK, Responses API (`gpt-6-luna` for chat, titles and OCR; `text-embedding-3-small` for embeddings) |

## Local setup

### Prerequisites

- Node.js 20+ and npm
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Docker (for local MinIO)
- A Postgres database with the `vector` extension available (Better Auth tables and the app tables share the `document_genie` schema)
- An OpenAI API key, a Resend account with a verified domain, Google OAuth credentials, and (for the contact form only) Upstash Redis and an n8n webhook

### 1. Install

```bash
git clone https://github.com/mzeeshanaltaf/docgenie-ai.git
cd docgenie-ai
npm install
cd backend && uv sync && cd ..
```

### 2. Configure

```bash
cp .env.example .env.local          # frontend
cp backend/.env.example backend/.env  # backend
```

Fill in both files (variables below). `INTERNAL_API_KEY` must be **identical** in both; generate one with `python -c "import secrets;print(secrets.token_urlsafe(32))"`. Do not quote values in Coolify.

### 3. Start storage

From the repo root:

```bash
docker compose --env-file backend/.env -f docker-compose.dev.yml up -d
```

This starts MinIO (API on `localhost:9100`, console on `9101`) and creates the private buckets `docgenie` and `docgenie-test`. Credentials and bucket name come from the `S3_*` values in `backend/.env`.

### 4. Migrate and run the backend

From `backend/`:

```bash
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8765
```

Check it: `curl -H "X-Internal-Key: <your key>" http://localhost:8765/v1/health` should report the database and storage as `ok`. (Port 8765 avoids a clash with whatever already holds 8000; set `BACKEND_API_URL` to match.) The migrations create the `vector` extension if the database user may; otherwise enable it once as a superuser.

### 5. Run the frontend

```bash
npm run dev      # http://localhost:3000
```

Sign up (the email code arrives through Resend), upload a document and chat.

### Tests and checks

```bash
# backend, from backend/
uv run pytest -q                      # full suite: real Postgres (throwaway schema), local MinIO; about 13 minutes against a remote DB
uv run pytest tests/test_parsing_chunking.py tests/test_auth_and_errors.py tests/test_config.py -q   # unit tests only, seconds
PYTHONPATH=. uv run python scripts/e2e_ingest.py http://localhost:8765   # live ingestion check (real OpenAI, a few cents)
PYTHONPATH=. uv run python scripts/e2e_chat.py http://localhost:8765     # live chat check (real OpenAI, a few cents)

# frontend, from the repo root
npx tsc --noEmit
npm run build
```

If the database or MinIO is unreachable the integration tests skip instead of failing.

## Environment variables

### Frontend (`.env.local`)

| Variable | Purpose | Build-time |
|---|---|---|
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Better Auth secret (32+ chars) and the app's base URL | |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in | |
| `DATABASE_URL` | Postgres for Better Auth | yes |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | OTP email; the sender domain must be verified in Resend | |
| `BACKEND_API_URL` | Base URL of the private backend, no trailing slash | |
| `INTERNAL_API_KEY` | Shared secret sent as `X-Internal-Key` (same as the backend's) | |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Contact-form rate limit (fails open if unset) | |
| `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_CONTACT_FORM_WEBHOOK_ID` | Contact form only | |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Analytics | yes |

### Backend (`backend/.env`)

Required: `DATABASE_URL`, `OPENAI_API_KEY`, `INTERNAL_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`.

Everything else is optional with a default in [backend/app/config.py](backend/app/config.py): models and reasoning effort (`CHAT_MODEL`, `CHAT_REASONING_EFFORT`, `CHAT_SERVICE_TIER`), limits (`MAX_UPLOAD_MB`, `MAX_PAGES`, `MAX_CSV_ROWS`), retrieval (`CHUNK_SIZE`, `RETRIEVAL_TOP_K`, `RRF_K`), agent (`AGENT_MAX_STEPS`, `QUERY_MAX_ROWS`, `QUERY_TIMEOUT_MS`), credits (`SIGNUP_DOC_CREDITS`, `SIGNUP_MESSAGE_CREDITS`) and prices (`LLM_INPUT_PRICE_PER_M`, `LLM_OUTPUT_PRICE_PER_M`; unset means `llm_usage.cost_usd` stays empty). [backend/.env.example](backend/.env.example) lists them all.

## Project structure

```
src/
  app/
    (marketing)/          landing, about, contact, privacy, terms, auth pages
    (dashboard)/dashboard/  overview, documents, chat, settings
    api/                  proxies to the backend, Better Auth, contact
  components/             app, auth, chat, contact, dashboard, marketing, seo, ui
  contexts/dashboard-data.tsx
  lib/                    backend client, SSE reader, chat runtime, auth, email, constants
  proxy.ts                session guard for /dashboard
backend/
  app/                    main, config, deps, errors, db, models, schemas, routers, services, prompts
  alembic/versions/       migrations
  docs/chat-stream.md     SSE contract
  tests/  scripts/
docker-compose.dev.yml    local MinIO
docs/plan/                rebuild plan and handoff log
PRODUCT.md  DESIGN.md     product and design brief
```

## Backend API

All routes are under `/v1`, need `X-Internal-Key`, and (except health and signup credits) `X-User-Id`. There is no generated OpenAPI; the endpoint table is in [docs/plan/progress.md](docs/plan/progress.md). In short: `health`, `users/{id}/signup-credits`, `credits/history`, `documents` (upload, list, get, content, delete), `chat/stream`, `sessions` (list, messages, rename, delete), `messages/{id}/feedback`, `dashboard`, `account/export`, `account` (delete). Error bodies are `{success, status, message, details}`.

## Email verification and password reset

Email and password accounts must verify their address before they get a session. Better Auth's `emailOTP` plugin issues a 6-digit code (10 minutes, 3 attempts, hashed in the existing `verification` table) and `src/lib/email.ts` delivers it through Resend.

- **Sign-up** -> `/verify-email` -> code -> signed in automatically.
- **Sign-in on an unverified account** -> a fresh code is mailed and the user is sent to the same screen.
- **Forgot password** -> `/forgot-password` -> code and new password -> back to `/sign-in`.

Google sign-ins arrive verified and skip the flow.

## Troubleshooting

- **Every API call returns 502 `BACKEND_AUTH_FAILED`:** `INTERNAL_API_KEY` differs between `.env.local` and `backend/.env`.
- **502 `BACKEND_UNAVAILABLE`:** the backend is not running, or `BACKEND_API_URL` points at the wrong port.
- **Upload says storage is unavailable (503):** MinIO is not running, or the `S3_*` values do not match it. `GET /v1/health` shows which check failed.
- **A document stays `processing`:** the OpenAI key or network failed during embedding; after 10 minutes the sweep marks it failed and refunds the credit.
- **Chat says the model is busy:** only happens with `CHAT_SERVICE_TIER=flex`, which is opt-in because it often returns 429.
- **Backend tests skip:** the database or MinIO is unreachable.
- **No verification email:** check `RESEND_API_KEY`, that the `RESEND_FROM_EMAIL` domain is verified in Resend, and the server console (send failures never reach the UI).

## Deployment

Production is a self-hosted [Coolify](https://coolify.io) instance on a Hostinger VPS. The frontend image is the root `Dockerfile` (Next.js `output: "standalone"`, port 3000, `curl` for the health check); pushing to `main` triggers `.github/workflows/deploy.yml`. Mark every `NEXT_PUBLIC_*` and `DATABASE_URL` as build-time, and never quote values. The backend is a second Coolify app built from `backend/Dockerfile` (base directory `/backend`, port 8000) with **no public domain**: the frontend reaches it at `http://docgenie-api:8000` over the shared `coolify` network (`BACKEND_API_URL`), and its container health check sends `X-Internal-Key`. MinIO is a separate Coolify service on the same network with no public exposure and a bucket-scoped key. A second workflow, `.github/workflows/deploy-backend.yml`, redeploys the backend when a push touches `backend/**`, and the backend container applies Alembic migrations (`alembic upgrade head`) before it starts serving, so a push with a new migration needs no manual step. Keep migrations backward compatible. The env var list and the Coolify names are in [docs/plan/progress.md](docs/plan/progress.md).

## License

This project is proprietary. All rights reserved.

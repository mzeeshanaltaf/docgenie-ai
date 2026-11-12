# CLAUDE.md

## Overview

DocGenie lets a signed-in user upload PDF / DOCX / TXT / CSV files and chat with them. Citations open the source page.

- **Next.js 16** (App Router, React 19, TypeScript strict) owns routing, auth and UI. Its `src/app/api/**` routes are thin authenticated proxies.
- **FastAPI backend** (`backend/`, Python 3.12, `uv`) owns all business logic: credits, ingestion (parsing, OCR, chunking, embeddings), hybrid retrieval, the chat agent, dashboard, account export and deletion. It is **private**: only the Next.js server calls it, never the browser.
- **Postgres** (schema `document_genie`, pgvector): Better Auth tables (`user`, `session`, `account`, `verification`; never touch them from the backend) plus the app tables created by Alembic.
- **MinIO** (S3-compatible, private bucket): original files at `users/{user_id}/{document_id}/{file_name}`.
- **OpenAI** (Responses API, hand-written tool loop, no LangChain): chat agent, titles, OCR, embeddings.
- **Contact form** is the one thing still on **n8n** (user decision, Phase 4). **Resend** sends transactional auth email only.
- Production target: self-hosted **Coolify** on a Hostinger VPS.

```
Browser -> Next.js (UI, Better Auth) -> src/app/api/**  (session -> X-Internal-Key + X-User-Id)
                                           -> FastAPI /v1  -> Postgres | MinIO | OpenAI
```

## Tech stack

- Next.js 16, React 19, TypeScript, Tailwind v4 (CSS-first, OKLCH tokens in `globals.css`), shadcn/ui primitives, CVA
- Better Auth (Postgres adapter, `document_genie` schema, `emailOTP` plugin), Resend
- assistant-ui (`@assistant-ui/react`, `assistant-stream`) for the chat, react-pdf for the viewer, `motion`, next-themes, sonner, lucide-react
- Backend: FastAPI, SQLAlchemy 2 async (asyncpg), Alembic, pgvector, boto3, pypdf / pypdfium2 / python-docx, sqlglot, OpenAI SDK

## Design system (read before any UI work)

Source of truth: [PRODUCT.md](PRODUCT.md) (audience, voice), [DESIGN.md](DESIGN.md) (tokens, type, grid, components, motion, bans) and `DESIGN.json`. Tokens live in `src/app/globals.css`. **Emerald is gone.**

- Fonts: Schibsted Grotesk (all words) and Spline Sans Mono (`figure` numbers and legend labels only).
- Accent is vermilion, exposed as `bg-brand` / `text-brand` (`primary` is an alias). shadcn `accent` is a neutral hover wash, not the brand. Spend the accent sparingly (The One Mark Rule).
- Use tokens only: `bg-background|card|muted`, `text-foreground|muted-foreground`, `border-rule`, `text-destructive|success|warning`, type utilities `text-display|section|headline|title|body|body-sm|caption|label`, helpers `figure`, `ds-label`, `page-container`, `page-grid`, `measure`. No raw palette classes (`emerald-600`, `slate-*`, `bg-white`), no hex, no gradients, no blur, no pill badges, radii 2 to 6 px, no em dashes in user-visible copy.
- Shared primitives: `components/app/{page-shell,tag,setting-row}.tsx`, `components/wordmark.tsx`, `components/auth/auth-shell.tsx`, `components/marketing/marketing-page.tsx`.
- Motion respects reduced motion (`MotionConfig reducedMotion="user"`; use `useReducedMotionSafe` from `lib/use-reduced-motion.ts` when the value changes what renders).

## Structure

```
src/
  app/
    (marketing)/       public pages (landing, about, contact, privacy, terms) + auth pages
                       (sign-in, sign-up, verify-email, forgot-password, wrapped in AuthShell)
    (dashboard)/dashboard/   protected: overview, documents, chat, settings
    api/               proxies to the backend (+ api/auth/[...all] = Better Auth, api/contact = n8n)
    icon.tsx, apple-icon.tsx, opengraph-image.tsx   generated brand images
  components/  app, auth, chat, contact, dashboard, marketing (+ landing/), seo, ui
  contexts/dashboard-data.tsx   DashboardDataProvider
  lib/  backend.ts, sse.ts, chat/*, auth*.ts, email.ts, constants.ts, format.ts, brand.ts, ...
  proxy.ts             session-cookie guard for /dashboard (Next 16 name for middleware)
  types/api.ts         backend response types + the SSE event union
backend/
  app/  main.py, config.py (every tunable), deps.py (auth deps), errors.py, db.py,
        models/, schemas/, routers/, services/, prompts.py
  alembic/versions/    0001 initial schema, 0002 'incomplete' message status, 0003 drop contact table
  docs/chat-stream.md  the SSE contract (read it before touching the chat adapter)
  tests/, scripts/     pytest suite, e2e + maintenance scripts
docker-compose.dev.yml local MinIO
docs/plan/             rebuild plan, handoff log (progress.md has the full contracts)
```

## Backend contracts

Full, current detail is in [docs/plan/progress.md](docs/plan/progress.md) ("Contracts later phases rely on", "HTTP endpoints", "Frontend contracts"). The essentials:

- **Auth between the apps:** every `/v1` route needs `X-Internal-Key` (constant-time compare with `INTERNAL_API_KEY`); user-scoped routes also need `X-User-Id`, set by Next.js from the Better Auth session and never taken from the browser. Another user's resource is always `404 NOT_FOUND`, never 403. `GET /v1/health` also needs the key.
- **Errors:** `raise ApiError(ErrorCode.X)` (`app/errors.py`) gives `{success:false, status:<CODE>, message, details}`. Codes include `INSUFFICIENT_CREDITS` 402, `FILE_TOO_LARGE` 413, `DUPLICATE_DOCUMENT` 409, `PAGE_LIMIT_EXCEEDED` / `ROWS_LIMIT_EXCEEDED` 400, `UNSUPPORTED_TYPE` 415, `NO_TEXT_FOUND`, `STORAGE_UNAVAILABLE` 503, `VALIDATION_ERROR` 422. Ingestion failures set `documents.error_code` (`IngestionErrorCode`); the UI text for them is in `src/lib/document-errors.ts`.
- **Routers** (`backend/app/routers/`): health, credits, documents, chat, sessions, feedback, dashboard, account. Add a router with `v1.include_router(...)` in `create_app()`.
- **Credits** (`services/credits.py`): `reserve` / `refund` work inside the caller's transaction and never commit. 5 documents + 25 messages on signup, 1 per upload, 1 per chat turn. Failed ingestion and answer-less turns are refunded.
- **Ingestion** is a background task after a `202`; the frontend polls `GET /documents/{id}` while `processing`. A stale-`processing` sweep runs at startup and every 5 minutes.
- **Chat stream:** `POST /v1/chat/stream` returns SSE (`message.start`, `reasoning.delta`, `tool.start|end`, `text.delta`, `citation`, `error`, `message.end`, then `session.title`). The exact contract with examples is [backend/docs/chat-stream.md](backend/docs/chat-stream.md). Every model call is stateless (`store=False`, encrypted reasoning items replayed).
- **`query_table`** (CSV questions) runs model-written SQL only through `services/sql_guard.py`: one `SELECT` over a relation named `rows`, allow-listed functions, regenerated from the AST, read-only transaction, timeout and row cap. Never loosen it without tests.
- **Retrieval** is one SQL statement: semantic (pgvector HNSW cosine) + keyword (`tsvector`) fused by RRF, always filtered by `user_id`.
- Every query is scoped by `user_id`. A test fails if a new table with a `user_id` column is missing from `ACCOUNT_TABLES` (account export/deletion), so add new tables there.

## Frontend: API proxies and data

- Resolve the user with `getUserId()` from `@/lib/auth-session`; no session = `401 {success:false,status:"UNAUTHORIZED"}`. Then call the backend through `src/lib/backend.ts` (server-only, never import from a client component): `forward(path, {userId, ...})` is a one-liner for nearly every route; `backendFetch`, `backendStream`, `backendJson` for the rest. A backend 401 is relayed as `502 BACKEND_AUTH_FAILED` (wrong internal key), unreachable = `502 BACKEND_UNAVAILABLE`, timeout = `504`.
- Route pattern:
  ```typescript
  export async function GET() {
    const userId = await getUserId();
    if (!userId) return unauthorized();
    return forward("/v1/dashboard", { userId });
  }
  ```
- `POST /api/documents` forwards `req.formData()`: **never set `Content-Type`** (fetch sets the boundary). `POST /api/chat` pipes the SSE body through unchanged (`text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`) and forwards `req.signal` so a closed tab cancels the run.
- `DashboardDataProvider` (`contexts/dashboard-data.tsx`) loads `/api/dashboard` + `/api/documents` once and exposes `dashboard`, `documents`, `creditBalance`, `messageBalance`, `loading`, `refreshAll()`. **Call `refreshAll()` after any credit- or data-changing action** (upload, delete, chat turn, even a failed one) or the sidebar and overview go stale. It polls documents that are `processing`.
- Chat: `lib/chat/` builds an assistant-ui runtime (`useRemoteThreadListRuntime` over `useLocalRuntime` with a `ChatModelAdapter` that reads the SSE through `lib/sse.ts`). Session ids are client-generated (`crypto.randomUUID()`); the backend creates the session on the first message. The chat page mounts through `next/dynamic` with `ssr: false`.
- Account deletion: `DELETE /api/account` goes through Better Auth `deleteUser` whose `beforeDelete` calls `DELETE /v1/account` first; the Better Auth user is removed only after the backend succeeded. Nothing may call the backend for that user afterwards (the UI does a full navigation to `/`).

## Auth (Better Auth)

- Server `src/lib/auth.ts`: pg `Pool` pinned to `document_genie` via `search_path`; email/password + Google. **Signup credits** are granted in `databaseHooks.user.create.after` (email and Google signups) by `POST /v1/users/{id}/signup-credits` (errors are logged and swallowed; the backend also grants lazily on first use).
- Client `src/lib/auth-client.ts` exposes `signIn`/`signUp`/`signOut`/`useSession` + `emailOtp.*`.
- `src/proxy.ts` guards `/dashboard(.*)` by session cookie (existence only) and redirects to `/sign-in`.

### Email OTP (`emailOTP` plugin + Resend)

- `requireEmailVerification: true`: sign-up returns **no session**; the user enters a 6-digit code. Unverified sign-in throws `EMAIL_NOT_VERIFIED` (and `sendOnSignIn` mails a fresh code), so `auth-form.tsx` redirects to `/verify-email?email=…&redirect=…`. `autoSignInAfterVerification` issues the session.
- Codes: 6 digits, 10 min, 3 attempts, hashed at rest, 3 sends/60 s (the plugin's own `rateLimit`; **don't** reuse `lib/rate-limit.ts`, its window/prefix are hardcoded to the contact form). Stored in the existing `verification` table.
- Client calls: `emailOtp.verifyEmail`, `.sendVerificationOtp`, `.requestPasswordReset`, `.resetPassword` (creates no session, push to `/sign-in`).
- Sending lives in `src/lib/email.ts` (`sendOtpEmail`). The Resend SDK **returns `{ data, error }` and never throws**: check `error`. No idempotency key (codes rotate). `from` must exactly match the verified Resend domain. Send failures never surface to the UI; debug via the server console + Resend dashboard.
- `disableSignUp: true` closes the plugin's passwordless account-creation path.

## Contact form (still n8n)

`/contact` posts to `/api/contact`: honeypot field `hp_field` (drop the submission if filled) + Upstash per-IP rate limit (`src/lib/rate-limit.ts`, fails open if unset), then `callN8nWebhook` (`src/lib/n8n.ts`, the only n8n code left) to `N8N_CONTACT_FORM_WEBHOOK_ID`. Progressive enhancement (native POST + fetch, 303 redirect for no-JS). The backend has no contact endpoint.

## Deployment (Coolify)

Three things run on the Hostinger VPS under Coolify (UUIDs and details: Phase 11 entry in `docs/plan/progress.md`):
- **Frontend** (`docgenie`): root `Dockerfile` (`output: "standalone"`, port 3000, **health check needs `curl`**), public at docgenie.zeeshanai.cloud. Pushing to `main` triggers `.github/workflows/deploy.yml` (secrets `COOLIFY_API_TOKEN`, `COOLIFY_APP_UUID`; no Coolify git webhook). All `NEXT_PUBLIC_*` and `DATABASE_URL` must be **build-time** env; `BACKEND_API_URL` and `INTERNAL_API_KEY` are runtime.
- **Backend** (`docgenie-api`): `backend/Dockerfile` (base directory `/backend`, port 8000), **no public domain**, reachable only as `http://docgenie-api:8000` (a fixed Coolify network alias on the `coolify` network). The Dockerfile `HEALTHCHECK` sends `X-Internal-Key` (the slim image has no `curl`; Coolify's own health check stays off). **Backend deploys and migrations are automatic**: `.github/workflows/deploy-backend.yml` redeploys it on pushes that touch `backend/**` (same `COOLIFY_API_TOKEN`; the app UUID is in the file), and the container runs `alembic upgrade head` before uvicorn (a failed migration stops the container, so Coolify keeps the old one). Migrations must be backward compatible (the old container serves while the new one migrates), single replica only, and back up first for anything risky. Creating an app in Coolify assigns a public `sslip.io` domain by default: clear it.
- **MinIO** (`docgenie-minio` service): internal only, private bucket `docgenie`, bucket-scoped key. The `minio/mc` image is gone from Docker Hub: administer it with `docker exec minio-<uuid> mc ...` (the `minio/minio` image bundles `mc`).
- Production and local development share one Postgres (`document_genie` schema), so a local `alembic upgrade head` or test run hits production data: be deliberate.

## Pitfalls

- **Never quote env values in Coolify.** dotenv strips surrounding quotes locally; Coolify passes them through verbatim (this once broke `RESEND_FROM_EMAIL` with a Resend 422).
- Anchor links from non-home pages must be `/#pipeline`, not `#pipeline` (anchors: `#pipeline`, `#limits`, `#stack`, `#preview`, `#faq`).
- Client-only state (random IDs, browser APIs) causes hydration mismatch: wrap the top client component in `next/dynamic` with `{ ssr: false }`.
- react-pdf/pdfjs need the `canvas` alias for **both** turbopack and webpack in `next.config.ts` (+ root `canvas-stub.js`).
- Landing figures in `components/marketing/landing/content.ts` (`PIPELINE_CONFIG`) are **copied** from `backend/app/config.py`; change both together. Limits and credits shared with the UI live in `lib/constants.ts` and must equal the backend.
- Port 8000 is often taken on the dev machine: run the backend on 8765 (`BACKEND_API_URL=http://localhost:8765`). Local MinIO is on 9100/9101.
- The dev database is a remote Postgres (about 1 s per round trip), so backend tests and live chat turns are slow locally.
- On Windows `npm run build` can fail once with a transient `EBUSY` while a dev server is stopping; retry.
- Use the Write/Edit tools to create files, not shell heredocs.

## Commands

```bash
# frontend (repo root)
npm run dev                 # localhost:3000
npm run build               # production build (standalone output)
npx tsc --noEmit            # type-check only

# local storage (repo root)
docker compose --env-file backend/.env -f docker-compose.dev.yml up -d

# backend (from backend/)
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8765
uv run pytest -q            # needs MinIO + DATABASE_URL; about 13 min; unit tests alone take seconds
```

## Environment variables

- **Frontend (`.env.local`, template `.env.example`):** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (both build-time), `BACKEND_API_URL`, `INTERNAL_API_KEY` (same value as the backend's), `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_CONTACT_FORM_WEBHOOK_ID` (contact only), `COOLIFY_API_TOKEN`, `COOLIFY_DEPLOY_TOKEN`.
- **Backend (`backend/.env`, template `backend/.env.example`):** `DATABASE_URL`, `OPENAI_API_KEY`, `INTERNAL_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`; every other setting has a default in `backend/app/config.py` and an override line in the example. Optional but unset today: `LLM_INPUT_PRICE_PER_M`, `LLM_OUTPUT_PRICE_PER_M` (without them `llm_usage.cost_usd` is NULL).
- `NEXT_PUBLIC_*` are client-exposed at build time; everything else is server-only.

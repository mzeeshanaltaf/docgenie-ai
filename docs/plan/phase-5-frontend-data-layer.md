# Phase 5: Frontend data layer swap

**Goal:** the Next.js app talks only to FastAPI, through thin authenticated proxies. All n8n code and env vars are gone.

**Depends on:** Phases 1–4 (the full backend API).
**Unblocks:** Phases 7–9 (UI work built on the new API).

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), and the Phase 1–4 log entries (Phase 4 has the full endpoint table; Phase 3 has the SSE contract).

**Record in the handoff** (in `progress.md`):
- The route map: each browser path under `/api/**` → its backend path, and which routes were removed.
- The frontend env var names added (e.g. the backend base URL, `INTERNAL_API_KEY`) and the `N8N_*` vars removed.
- The exported API of `src/lib/backend.ts` and where the types live (`src/types/api.ts`).
- What `DashboardDataProvider` now exposes, and how document-status polling works.
- How account deletion is wired (the backend call, then the Better Auth user deletion).
- Any UI that is functional but still unstyled or temporary, for Phases 7 and 8 to replace.

## Tasks

### 1. Backend client (`src/lib/backend.ts`)
- `backendFetch(path, { userId, … })` adds `X-Internal-Key` and `X-User-Id`. Add a stream variant for SSE.
- New `src/types/api.ts` holds the response types.

### 2. Remove n8n code
Delete:
- `src/lib/n8n.ts`, `n8n-documents.ts`, `n8n-data.ts`, `n8n-credits.ts`, `n8n-analytics.ts`, `n8n-delete.ts`
- `src/types/n8n.ts`
- the dead `src/lib/refresh-credits.ts`
- the `N8N_*` env vars (in `.env.local` and the env docs)

### 3. API routes (`src/app/api/**`)
- Rewrite them as thin proxies following the existing `getUserId()` pattern from `src/lib/auth-session.ts`: 401 without a session, then forward to FastAPI with the user id in a header (never in the body).
- **Remove** the five unused routes: `analytics`, `credits/balance`, `documents/list`, `chat/history`, `chat/title`.
- **Add** routes for sessions, message feedback, document content (streams the file from FastAPI) and account (export, delete).
- `src/app/api/chat/route.ts` pipes the SSE body through unchanged, with correct headers (`text/event-stream`, no-cache) and no buffering.
- Uploads: multipart passthrough. Never set `Content-Type` manually.

### 4. Auth hooks (`src/lib/auth.ts`)
- `databaseHooks.user.create.after` calls `POST /v1/users/{id}/signup-credits`.
- Account deletion: call `DELETE /v1/account`, and on success delete the Better Auth user (Better Auth's `user.deleteUser` path).

### 5. Dashboard context (`src/contexts/dashboard-data.tsx`)
- Slim it down to the dashboard summary + documents list. No eager base64 preview fetch, no full chat histories.
- Keep `refreshAll()` so existing call sites still work.
- Poll `GET /api/documents/{id}` while any document is `processing`.

### 6. Contact route (`src/app/api/contact/route.ts`)
Keep the `hp_field` honeypot, the Upstash per-IP limit and progressive enhancement; forward to `POST /v1/contact`.

### 7. Next 16 rename
Rename `src/middleware.ts` to `src/proxy.ts`.

## Exit criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] `grep -ri n8n src/` returns nothing.
- [ ] With MinIO, uvicorn and `npm run dev` running, the existing UI works end to end: sign up → 5/25 credits, upload, chat, delete, contact form.
- [ ] `/dashboard` is still protected by `src/proxy.ts`.

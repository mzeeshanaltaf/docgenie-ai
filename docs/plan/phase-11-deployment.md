# Phase 11: Deployment to Coolify

> **Requires separate confirmation from the user before starting.** Everything before this phase is built and verified locally only.

**Goal:** MinIO, the FastAPI backend and the updated frontend running in production on the Hostinger VPS under Coolify, with the n8n workflows retired.

**Depends on:** Phase 10 passing in full.

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), and the Phase 10 entry (**production env var list and migration steps**). Confirm with the user that deployment may start before doing anything on the VPS.

**Record in the handoff** (in `progress.md`):
- Coolify app/service names and UUIDs for MinIO and the backend (no secrets).
- The internal hostnames the frontend uses to reach the backend and the backend uses to reach MinIO.
- The production smoke-test result.
- The date the n8n workflows were deactivated.
- When finished: remove the "Active rebuild" section from `CLAUDE.md` and mark the rebuild complete in [README.md](README.md).

## Tasks

### 1. MinIO
Deploy it with the `add-minio-storage-to-coolify` skill: a Coolify service on the shared Docker network (no public exposure), a private bucket and credentials.

### 2. Backend
Deploy it with the `add-app-to-coolify` skill as a new Coolify app built from `backend/Dockerfile`:
- internal network only, **no public domain**
- a health check against `/v1/health` (make sure `curl` is in the image)
- env vars from `backend/.env.example`. **Never quote values in Coolify.**

### 3. Database
Run `alembic upgrade head` against production `document_genie`, then the signup-credit re-grant script. Back up first. The Better Auth tables must stay untouched.

### 4. Frontend
- Set `BACKEND_URL` (internal) and `INTERNAL_API_KEY` in the existing Coolify app, and remove every `N8N_*` var.
- `NEXT_PUBLIC_*` and `DATABASE_URL` remain **build-time** env.
- Deploy by pushing to `main` (GitHub Actions triggers Coolify). Commit only when the user asks.

### 5. Smoke test in production
Sign up, upload, chat with citations, delete, contact form.

### 6. Retire n8n
Deactivate the 8 DocGenie workflows once production has run cleanly. Make sure the rotated n8n key is no longer used anywhere.

## Exit criteria

- [ ] Production health check is green for DB and storage.
- [ ] The production smoke test passes.
- [ ] The n8n workflows are deactivated.

## After this plan (recommendations, not in scope)

- A reranking step after hybrid search if answer quality needs it.
- Per-user rate limiting on chat and upload (Upstash is already available).
- A real job queue (Redis + worker) if upload volume grows beyond what in-process background tasks handle.
- Langfuse tracing for agent runs.
- Paid plans via Polar, replacing the removed placeholder tiers.
- More formats: XLSX, Markdown, PPTX.
- A CSP header in `next.config.ts`.

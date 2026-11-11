# Phase 10: Documentation and full verification

**Goal:** up-to-date documentation and an end-to-end local check of the whole system before any deployment.

**Depends on:** Phases 1–9.
**Unblocks:** Phase 11 (deployment).

## Session handoff

**Read before starting:** [README.md](README.md) and **all** of [progress.md](progress.md): every log entry, especially the deviations and open issues, because this phase reconciles them.

**Record in the handoff** (in `progress.md`):
- The test results (backend suite counts, end-to-end checklist outcome, `tsc` and build), with any failures and whether they were fixed.
- **The complete production env var list** for the backend, MinIO and frontend (names, build-time vs. runtime, and which are new). This is Phase 11's main input.
- The production migration steps in order (migrations, re-grant script, anything else).
- Confirmation that `CLAUDE.md` was rewritten and the "Active rebuild" pointer was reduced to Phase 11 only.

## Tasks

### 1. Documentation
- **`CLAUDE.md`:** describe the new architecture (FastAPI backend, MinIO, internal auth headers, SSE contract, assistant-ui), point to `DESIGN.md` for UI work, and replace the n8n sections, env vars and styling notes (emerald is gone).
- **`README.md`:** local setup (MinIO via `docker-compose.dev.yml`, `uv` backend, migrations, `npm run dev`), env vars for both apps, architecture overview.
- **`backend/.env.example`** and the frontend env list match `config.py` and `src/lib/backend.ts`.

### 2. Backend test suite
Run the full `pytest` suite (real Postgres in a throwaway schema, local MinIO) and make sure everything from Phases 2–4 passes:
- credit reservation under concurrency (no double spend, 0 credits rejected, refund on failure)
- duplicate upload; size, page and row limits; type sniffing
- hybrid search returning matches that are only keyword and matches that are only semantic
- `sql_guard` rejecting writes, other tables and multiple statements
- cross-user access denied on every endpoint
- cascade delete removing the MinIO object
- the stream contract test

### 3. End to end, locally
Start MinIO, the backend (`uvicorn`) and `npm run dev`, then:

1. Sign up a fresh user; confirm 5/25 credits.
2. Upload a text PDF, a scanned PDF (OCR), a DOCX, a CSV, an oversize file and a 60-page PDF. The first four reach `ready`; the last two are rejected with clear messages.
3. Chat with each document. Check streaming, reasoning, tool traces, timestamps, metrics, copy, like, dislike with a reason, citation click-through to the right page, document selection, stop, session rename and delete.
4. Spend all message credits and check the zero-credit behavior.
5. Export the account, then delete it. Confirm that no DB rows and no MinIO objects remain.

### 4. Frontend checks
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run build` passes.
- [ ] No remaining `n8n` references anywhere in `src/`.
- [ ] Light and dark themes, mobile widths, reduced motion, keyboard navigation.
- [ ] An `impeccable audit` + `polish` pass on the landing page and the chat.

## Exit criteria

Every check above passes, and any failures are fixed or listed explicitly before Phase 11 is proposed.

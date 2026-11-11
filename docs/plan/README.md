# DocGenie rebuild: plan and session handoff

The rebuild is split into 11 phases. **Each phase runs in its own Claude Code session.** Sessions share no memory, so everything a session needs is in three places:

| File | What it holds | Who updates it |
|---|---|---|
| `docs/plan/README.md` (this file) | Why we're rebuilding, the target architecture, confirmed decisions, conventions, the session protocol, the status table | The session that finishes a phase (status table only) |
| `docs/plan/phase-N-*.md` | The scope, tasks and exit criteria for one phase | Nobody, after the plan is approved. Deviations go in `progress.md` |
| `docs/plan/progress.md` | Cumulative current state (how to run things, env var names, contracts) plus a handoff entry per finished phase | Every session, at the end |

## Kickoff prompt for a new session

Paste this into the new session, changing `N`:

```
Implement Phase N of the DocGenie rebuild. Start by reading docs/plan/README.md and follow its session protocol.
```

## Session protocol

### At the start
1. Read this README in full.
2. Read `docs/plan/progress.md`: the whole **Current state** section, plus the log entries for every phase listed under the phase file's **Read before starting**.
3. Read your phase file in full.
4. Check that the phases it depends on are marked `done` in the status table. If one isn't, stop and tell the user.
5. Quickly check that the previous phase's handoff is still true (e.g. the backend starts, migrations are at head, the tests pass). Report any drift before building on it.
6. Raise any **open assumptions** for this phase (listed below) with the user before writing code that depends on them.
7. Load the skills the phase file names before using them.

### While working
- The phase file is the spec. If you need to deviate (an API differs from what the plan assumed, a library choice changes, a task moves to another phase), do it, and record the deviation and its reason for the handoff.
- Stay inside the phase's scope. If you notice work that belongs to a later phase, note it for the handoff instead of doing it.
- Don't edit the phase files for past or future phases. Corrections go in `progress.md`.

### At the end
1. Go through the phase's exit criteria and say which pass. Do not mark the phase `done` if any fail; mark it `partial` and list what's missing.
2. Add a log entry to `progress.md` using the template there. Include everything listed under **Record in the handoff** in your phase file.
3. Update the **Current state** section of `progress.md` (run commands, env var **names**, services and ports, contracts) so it matches reality now.
4. Update the status table below.
5. Ask the user whether to commit. Never commit without being asked. If they say yes, record the commit hash in the status table.
6. End with a short summary for the user, including the kickoff prompt for the next phase.

**Never write secrets** (API keys, passwords, tokens, connection strings with credentials) into any plan file. Record env var names and where the values live.

## Status

| Phase | File | Status | Session date | Commit |
|---|---|---|---|---|
| 1 | [Backend foundation](phase-1-backend-foundation.md) | done | 2026-11-11 | d27fb66 |
| 2 | [Documents and ingestion](phase-2-documents-and-ingestion.md) | done | 2026-11-11 | |
| 3 | [Chat backend](phase-3-chat-backend.md) | not started | | |
| 4 | [Dashboard, account, contact](phase-4-dashboard-account-contact.md) | not started | | |
| 5 | [Frontend data layer](phase-5-frontend-data-layer.md) | not started | | |
| 6 | [Design system](phase-6-design-system.md) | not started | | |
| 7 | [Chat UI and document viewer](phase-7-chat-ui-and-document-viewer.md) | not started | | |
| 8 | [App surfaces redesign](phase-8-app-surfaces-redesign.md) | not started | | |
| 9 | [Landing and marketing](phase-9-landing-and-marketing.md) | not started | | |
| 10 | [Docs and verification](phase-10-docs-and-verification.md) | not started | | |
| 11 | [Deployment](phase-11-deployment.md) | not started (needs separate confirmation) | | |

Statuses: `not started`, `in progress`, `partial`, `done`.

**Order:** 1 → 2 → 3 → 4 → 5, then 6 → 7 → 8 → 9 → 10 → 11. Phase 6 depends on nothing technical and may run earlier. Phases 7 and 8 may run in either order once 5 and 6 are done.

## Why we're rebuilding

DocGenie's backend is 8 n8n workflows called through Next.js proxy routes. An analysis found these problems:

- A stray wire skips the upload credit check, so 0-credit users ingest for free.
- The chat agent runs arbitrary model-written SQL with the full DB credential, in the same schema as the auth tables.
- The Credits webhook is unauthenticated.
- Files sit in Postgres `bytea` and are sent to the browser as base64 on every dashboard load.
- AI responses are stored JSON-escaped.
- Chat errors show up as "No response".
- The UI is stock shadcn slate with hardcoded emerald and the standard generated-landing-page patterns.

## Target architecture

```
Browser
  └─ Next.js 16 (UI, Better Auth, routing)
       └─ src/app/api/**  thin proxies: resolve session → add X-Internal-Key + X-User-Id
            └─ FastAPI backend (private, never public)        backend/
                 ├─ Postgres  schema document_genie  (pgvector, app tables via Alembic)
                 ├─ MinIO     original files, key users/{user_id}/{document_id}/{file_name}
                 └─ OpenAI    Responses API: chat agent, titles, OCR, embeddings
```

- The FastAPI service owns all business logic: credits, ingestion, retrieval, the agent and storage.
- Chat streams as SSE from FastAPI, piped unchanged through `/api/chat`, and is consumed by an assistant-ui `ChatModelAdapter`.
- The UI follows `PRODUCT.md` + `DESIGN.md` (written in Phase 6).

## Confirmed decisions

| Topic | Decision |
|---|---|
| Browser to backend | Next.js API routes stay as thin authenticated proxies; FastAPI is private |
| Upload limit | 20 MB and 50 pages per document (configurable) |
| Rollout | Build and verify locally; the Coolify deploy is the final phase and needs separate confirmation |
| Design | Precise technical lane, audience is prospective clients and employers, new palette (emerald dropped), light first with dark supported |
| Extras in scope | Click-through citations, per-chat document selection, OCR for scanned PDFs, account deletion and export |
| Data | `document_genie` app data is dummy; app tables may be dropped and rebuilt. Better Auth tables (`user`, `session`, `account`, `verification`) are never touched |
| LLM stack | OpenAI Python SDK, Responses API, hand-written tool loop (no LangChain) |
| Commits | Only when the user asks |

## Open assumptions (confirm in the phase shown)

| Assumption | Confirm in |
|---|---|
| `gpt-6-luna` is used exactly as given and supports `service_tier: "flex"`, `reasoning.effort: "medium"`, reasoning summaries and image input. If any is unsupported, stop and report; don't substitute silently | Phase 1 (smoke test) |
| Credits stay at 5 documents + 25 messages on signup, 1 per upload, 1 per chat turn | Phase 2 |
| The contact workflow is replaced by storing the submission in the DB and emailing `CONTACT_NOTIFY_EMAIL` via Resend | Phase 4 |
| "copied/linked/disliked" means copy, like, dislike | Phase 3 / 7 |

When an assumption is confirmed or changed, record that in `progress.md` under **Decisions made during implementation**.

## Conventions every session follows

- **Project rules:** `CLAUDE.md` at the repo root. Until Phase 10 rewrites it, its n8n sections describe the *current* system that is being replaced, not the target.
- **Writing files:** use the Write/Edit tools, never shell heredocs (they fail on this Windows setup).
- **Hydration:** client trees that use random ids or browser APIs are mounted with `next/dynamic` and `{ ssr: false }`.
- **react-pdf:** the `canvas` alias must be set for both turbopack and webpack in `next.config.ts`.
- **Multipart:** never set `Content-Type` manually.
- **Coolify env:** never quote values. `NEXT_PUBLIC_*` and `DATABASE_URL` are build-time.
- **Resend:** the SDK returns `{ data, error }` and never throws, so check `error` explicitly.
- **After any credit- or data-changing action in the UI**, call `refreshAll()`.

### Skills by phase

| Phase | Skills |
|---|---|
| 1–4 | `fastapi-python` (not `claude-api`: the LLM provider is OpenAI) |
| 2 | `add-minio-storage-to-coolify` (local traps: path-style, dummy region) |
| 4 | `resend` |
| 5 | `better-auth-best-practices`, `nextjs-best-practices` |
| 6, 8, 9 | `impeccable` (`teach`, `craft`, `audit`, `polish`) |
| 7 | `assistant-ui` (check `assistant-ui.com/llms.txt` for current API names), `pdf-preview` |
| 11 | `add-minio-storage-to-coolify`, `add-app-to-coolify` |

## When the rebuild is finished

Phase 10 rewrites `CLAUDE.md` for the new architecture. At that point, remove the "Active rebuild" pointer from `CLAUDE.md` (or reduce it to a one-line mention of Phase 11 if deployment is still pending).

# Phase 4: Dashboard, account and contact endpoints

**Goal:** the remaining backend endpoints, so the backend fully covers what the n8n workflows did plus account export and deletion.

**Depends on:** Phases 1–3.
**Unblocks:** Phase 5 (frontend data layer swap).

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), and the Phase 1–3 log entries.

**Record in the handoff** (in `progress.md`):
- The `GET /v1/dashboard` response shape.
- The export zip layout (file and folder names).
- The deletion order in `DELETE /v1/account`, and what Next.js must do afterwards (delete the Better Auth user).
- The new env var names (`CONTACT_NOTIFY_EMAIL`, the Resend sender) and whether the contact assumption was confirmed.
- **A full endpoint table** (method, path, request, response, error codes) for the whole backend, or a link to the generated OpenAPI at `/docs`. This is Phase 5's main input.

## Assumption to confirm

- The contact workflow is not in the n8n export. Its replacement stores the submission in the DB and emails it to a configurable `CONTACT_NOTIFY_EMAIL` via Resend.

## Files

```
backend/app/routers/dashboard.py  routers/account.py  routers/contact.py
```

## Tasks

### 1. `GET /v1/dashboard`
Returns the balances (documents, messages), document and session counts, and recent sessions (**titles only, no message bodies**), plus whatever the redesigned Overview needs for recent activity and usage (see Phase 8). The response stays small: no file bytes, no full chat histories.

### 2. Account
- **`GET /v1/account/export`:** a zip with a JSON dump of the user's documents metadata, sessions, messages, feedback and credit transactions, plus the original files fetched from MinIO.
- **`DELETE /v1/account`:** full deletion of every app row for the user and every MinIO object under `users/{user_id}/`. The Better Auth user row is deleted from Next.js (Phase 5) after this call succeeds.

### 3. `POST /v1/contact`
- Store the submission in `contact_submissions` (`name`, `email`, `message`, `ip`).
- Email it to `CONTACT_NOTIFY_EMAIL` via Resend. The Resend SDK returns `{ data, error }` and does not throw, so check `error` explicitly.
- Honeypot and rate limiting stay in the Next.js route (Phase 5).

## Tests

- [ ] Dashboard numbers match the DB state after uploads and chats.
- [ ] Export contains every JSON section and every original file.
- [ ] Account deletion leaves no rows in any app table and no objects under the user's prefix.
- [ ] Cross-user access is denied on every endpoint.
- [ ] Contact submission is stored, and a Resend failure is logged without losing the row.

## Exit criteria

- [ ] Every endpoint in the plan's endpoint table exists and is tested.
- [ ] The backend can replace all n8n workflows.

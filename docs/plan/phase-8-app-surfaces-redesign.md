# Phase 8: Dashboard, settings and auth pages redesign

**Goal:** every authenticated surface and every auth page follows `DESIGN.md` and uses the new data layer.

**Depends on:** Phase 5 (data layer), Phase 6 (design system). Can run alongside Phase 7.
**Unblocks:** Phase 10 (verification).

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), the Phase 2 entry (ingestion `error_code` values), the Phase 4 entry (dashboard shape), the Phase 5 entry (route map, temporary UI), the Phase 6 entry, the Phase 7 entry if it is done (document viewer props), and `DESIGN.md`.

**Record in the handoff** (in `progress.md`):
- Where the `error_code` → user message mapping lives.
- The layout primitives created for the dashboard shell and auth pages that Phase 9 should reuse for its shared grid language.
- Any surfaces that still use raw palette classes or old patterns.
- The results of the light/dark, mobile and keyboard checks.

Use the `impeccable` skill's `craft` for each surface below.

## Tasks

### 1. Dashboard shell
- A second neutral layer for the sidebar.
- Credits shown **once** (not in both the navbar and the sidebar).
- A real breadcrumb.
- "Help & Support" points to `/contact`.

### 2. Overview
Recent activity and usage replace the three stat cards. Data comes from `GET /api/dashboard`.

### 3. Documents
- Upload shows a status for each file: processing, ready, or failed with a readable reason mapped from `error_code` (`FILE_TOO_LARGE`, `PAGE_LIMIT_EXCEEDED`, `UNSUPPORTED_TYPE`, `NO_TEXT_FOUND`, …).
- The list shows page counts and an OCR marker.
- Preview opens the Phase 7 document viewer.
- Call `refreshAll()` after upload and delete.

### 4. Settings
A working Account tab:
- **Export:** downloads the zip from `/api/account/export`.
- **Delete:** a typed confirmation, then account deletion, sign-out and a redirect to the landing page.

### 5. Auth pages
`sign-in`, `sign-up`, `verify-email`, `forgot-password` get a composed two-area layout that shares the landing page's grid language. Keep the existing OTP and Google flows unchanged in behavior.

## Exit criteria

- [ ] No raw palette classes (`emerald-*`, etc.) remain in dashboard or auth components.
- [ ] Light and dark themes, mobile widths and keyboard navigation work on every surface.
- [ ] Export downloads a valid zip; delete removes the account and its data.
- [ ] Sign-up → OTP → dashboard and forgot-password flows still work.

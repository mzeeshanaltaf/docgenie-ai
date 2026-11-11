# Phase 7: assistant-ui chat and document viewer

**Goal:** a new chat built on assistant-ui that shows streaming reasoning, tool traces, citations, timing metrics and feedback. Citations open a document viewer at the cited page.

**Depends on:** Phase 3 (stream contract), Phase 5 (proxies), Phase 6 (design system).
**Unblocks:** Phase 9 (the landing hero replays this UI).

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), the Phase 3 entry (**SSE contract**), the Phase 5 entry (route map), the Phase 6 entry (tokens, fonts), and `DESIGN.md`.

**Record in the handoff** (in `progress.md`):
- The `@assistant-ui/*` versions installed and the actual API names used (runtime, adapters, primitives), especially where they differ from what the plan assumed.
- The component map under `src/components/chat/`.
- **What Phase 9 can reuse for the hero replay:** which components render a message, its trace and its metrics from static data, and the props they take.
- How the document viewer is opened at a page/snippet (component and props).
- Any stream events the UI doesn't handle yet.

## Before writing code

Follow the `assistant-ui` skill and check `assistant-ui.com/llms.txt` for the exact current API names.

## Tasks

### 1. Packages and elements
- Install `@assistant-ui/react` and `@assistant-ui/react-markdown`.
- Add elements with `npx assistant-ui@latest add thread`, then restyle them to `DESIGN.md`.

### 2. Runtime (`src/lib/chat/adapter.ts`)
- `useLocalRuntime` with a custom `ChatModelAdapter` that reads the SSE stream from `/api/chat`. This is the skill's recommended path for a custom backend that does not use the AI SDK.
- Map events to parts: `reasoning.delta` → `reasoning`; `tool.start`/`tool.end` → `tool-call` with its result; `text.delta` → `text`; `citation` → `source`.
- On `message.end`, yield `metadata.timing` and `metadata.custom` (message id, server timestamp, model).

### 3. Threads
- A remote thread list adapter backed by `/api/sessions` (list, rename, delete, new).
- A history adapter that loads `/api/sessions/{id}/messages`.
- Session ids stay client-generated UUIDs.
- Mount the chat page through `next/dynamic` with `ssr: false` (client-generated ids; see the hydration pitfall in `CLAUDE.md`).

### 4. Per-message UI (`src/components/chat/`)
- **Reasoning:** a collapsible block that streams live and collapses when the answer starts.
- **Tool traces:** one row per call with name, arguments and duration, and an expandable result summary.
- **Footer:** date/time, copy, like, dislike, and a metrics line (time to first token, total time, tokens/s) in the mono font.
- **Dislike:** opens an inline popover (not a modal) with reason chips (inaccurate, not in my documents, incomplete, too slow, other) and an optional comment. It is saved through a feedback adapter to `/api/messages/{id}/feedback`. Message ids come from the server, replacing the current `lastId + 1` guess.
- **Citations:** numbered chips; clicking one opens the document viewer at the cited page.

### 5. Composer and states
- A stop button.
- A document picker (all documents or a selection), saved on the session via `PATCH /api/sessions/{id}`.
- Clear error states for: insufficient message credits, flex tier busy, stream interrupted.
- Call `refreshAll()` after each completed turn so the credit displays stay current.

### 6. Mobile
The thread list goes in a sheet (it can't be reached on mobile today).

### 7. Document viewer
- `pdf-viewer.tsx` loads from `/api/documents/{id}/content` instead of base64.
- It accepts an initial page and a text snippet to highlight in the text layer.
- TXT/CSV citations scroll to the chunk.
- Keep the existing react-pdf `canvas` alias for both turbopack and webpack in `next.config.ts`.

## Exit criteria

- [ ] Streaming, reasoning, tool traces, timestamps and metrics all render live.
- [ ] Copy, like, and dislike with reason and comment persist and survive a reload.
- [ ] Clicking a citation opens the right document at the right page with the snippet highlighted.
- [ ] Document selection limits retrieval; stop works; session rename and delete work.
- [ ] The zero-credit state shows a clear message instead of "No response".
- [ ] Works on mobile widths; `npx tsc --noEmit` passes.

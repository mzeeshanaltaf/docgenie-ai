# Phase 9: Landing page, marketing pages and brand assets

**Goal:** a landing page that proves engineering quality by showing the real product, plus restyled marketing pages and a new brand identity.

**Depends on:** Phase 6 (design system), Phase 7 (the hero replays the real chat UI).
**Unblocks:** Phase 10.

## Session handoff

**Read before starting:** [README.md](README.md), the Current state in [progress.md](progress.md), the Phase 6 entry, the Phase 7 entry (**reusable components for the hero replay**), the Phase 8 entry (shared layout primitives), `DESIGN.md` and `PRODUCT.md`. Get the real limits and credit numbers from `backend/app/config.py`, not from memory.

**Record in the handoff** (in `progress.md`):
- The section component map for the landing page.
- The brand asset files and where the logo source lives.
- The JSON-LD validation result.
- Any copy or figures that still need the user's input.

Use the `impeccable` skill's `craft` for each surface. Copy follows the skill's rules (no em dashes, no headings restated in the text below them).

## Tasks

### 1. Landing page
Split `src/app/(marketing)/page.tsx` into section components:

1. **Hero:** a plain statement of what the product does, beside a faithful replay of the actual chat UI with its trace and timing. This is the one orchestrated `motion` sequence: question → reasoning trace → tool calls → cited answer → timing readout.
2. **How an answer is made:** the pipeline (parse, chunk, hybrid search, agent, cited answer) as a scroll-driven diagram.
3. **What it handles:** formats and the real limits (20 MB, 50 pages, 10,000 CSV rows, scanned PDFs via OCR).
4. **Under the hood:** the stack and engineering choices, written for a technical reader.
5. **Free preview:** the honest offer (5 documents, 25 messages). **Remove** the Pro and Enterprise tiers, which can't be bought, and the unverified "< 5 seconds" claim.
6. **FAQ and closing CTA.** Keep the JSON-LD and correct it to match the new content.

Motion: content is visible by default, `prefers-reduced-motion` is fully respected, nothing animates layout properties.

### 2. Navigation
- The navbar gets a mobile menu.
- Simplify the footer.
- Anchor links from non-home pages stay as `/#section`.

### 3. Other marketing pages
Restyle About, Contact, Privacy, Terms and 404. Fix stale limits, dates and credit numbers so they match the backend config. The contact form keeps progressive enhancement.

### 4. Brand assets
- Wordmark/logo.
- `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`.
- Theme colors (viewport `themeColor` for light and dark).

## Exit criteria

- [ ] Every figure on the landing page (limits, credits) matches the backend config.
- [ ] Hero replay and pipeline diagram work with motion on and with reduced motion.
- [ ] Mobile menu works; no horizontal scroll at phone width.
- [ ] JSON-LD validates.
- [ ] No banned patterns from `DESIGN.md` remain.

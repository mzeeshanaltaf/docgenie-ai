# Phase 6: Product and design system

**Goal:** `PRODUCT.md` and `DESIGN.md` at the project root, plus their tokens and fonts in `globals.css`. Every UI phase after this one follows them.

**Depends on:** nothing technical; can run in parallel with backend phases. Must finish before Phases 7–9.
**Unblocks:** Phases 7, 8, 9.

## Session handoff

**Read before starting:** [README.md](README.md) and the Current state in [progress.md](progress.md). No earlier phase entry is required; this phase depends on nothing technical.

**Record in the handoff** (in `progress.md`):
- The chosen sans and mono fonts and why. Also put them under "Decisions made during implementation".
- The accent and neutral OKLCH values, and the token names components should use.
- Which `DESIGN.md` sections later phases must read before building a surface.
- Shared components whose emerald classes were replaced, and any still left over.

## Process

Use the `impeccable` skill:
1. `teach` writes `PRODUCT.md`.
2. Write `DESIGN.md` as the forward-looking system. It is **not** a scan of the current UI.
3. Later phases run `craft` per surface.

Approval of the overall plan counts as confirming the shape brief. Visual probes are skipped because this harness has no native image generation.

## Design brief

- **Who and why:** prospective clients and employers judging engineering quality. The product itself is the proof, so the site shows the real machinery instead of describing it.
- **Scene:** someone evaluating work at a desk in daylight, with the site next to a PDF. Light first; dark fully supported.
- **Lane:** precise technical. Anchors: Linear's product pages (real UI shown close up), Stripe docs (clarity, density), a printed engineering datasheet (ruled lines, small labelled figures).
- **Color:** restrained. Cool-neutral paper and ink tinted toward the brand hue; one accent used only for actions, selection and citation marks. **Emerald is dropped.** The accent avoids both emerald and the AI-purple reflex. Working direction: red-pencil vermilion, the color of a reviewer's mark on a document. All colors become OKLCH tokens (`--brand`, `--brand-foreground`, …); components use no raw palette classes.
- **Type:** one committed sans for UI and display, plus a real mono for figures (timings, token counts, page refs), where the mono carries actual data. Choose both with the skill's font procedure, excluding its reflex list and the current DM Serif Display. The mono must actually be loaded.
- **Layout:** strict visible grid with hairline rules, left-aligned, varied section rhythm. **Banned:** pill badges, glow blobs, dot grids, gradient text, icon-card triplets, repeated eyebrow/H2/subhead stacks.
- **Motion:** the `motion` library. One orchestrated hero sequence (Phase 9), scroll-linked reveals on the pipeline section, 150–250 ms state transitions in the app. Exponential ease-out, no animation of layout properties, full `prefers-reduced-motion` support with content visible by default.
- **Copy:** follow the skill's rules (no em dashes, no headings restated in the text below them).

## Tasks

1. Write `PRODUCT.md` (audience, purpose, voice, what the product proves).
2. Write `DESIGN.md`: tokens, type scale, spacing, grid, component rules, motion rules and the banned patterns, so later UI work stays aligned.
3. Implement the tokens as OKLCH CSS variables in `src/app/globals.css` (light and dark), mapped into Tailwind v4's `@theme`.
4. Load the chosen sans and mono with `next/font` and wire them into the theme.
5. Install `motion`.
6. Replace hardcoded emerald classes in shared primitives (`src/components/ui/*`) with the new tokens, so later phases start clean.

## Exit criteria

- [ ] `PRODUCT.md` and `DESIGN.md` exist at the root and cover every brief point above.
- [ ] Tokens work in light and dark mode; `next-themes` switching still works.
- [ ] Both fonts load (checked in the network panel).
- [ ] `grep -r emerald src/components/ui` returns nothing.

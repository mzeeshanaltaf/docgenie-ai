---
name: DocGenie
description: Precise-technical design system for a document Q&A product that shows its own machinery. Cool graphite paper and ink, one red-pencil vermilion accent, a grotesk for words and a mono for figures.
colors:
  paper: "oklch(0.985 0.004 250)"
  surface: "oklch(0.992 0.003 250)"
  wash: "oklch(0.962 0.006 250)"
  hover-wash: "oklch(0.945 0.008 250)"
  ink: "oklch(0.205 0.02 255)"
  ink-soft: "oklch(0.48 0.022 255)"
  rule: "oklch(0.895 0.008 250)"
  rule-strong: "oklch(0.78 0.012 252)"
  control-edge: "oklch(0.63 0.02 252)"
  vermilion: "oklch(0.55 0.19 34)"
  vermilion-pressed: "oklch(0.49 0.18 34)"
  vermilion-tint: "oklch(0.95 0.025 34)"
  on-vermilion: "oklch(0.985 0.004 250)"
  crimson: "oklch(0.5 0.2 18)"
  proof-green: "oklch(0.5 0.12 145)"
  amber-flag: "oklch(0.54 0.1 70)"
  paper-dark: "oklch(0.17 0.015 255)"
  surface-dark: "oklch(0.205 0.017 255)"
  wash-dark: "oklch(0.235 0.016 255)"
  ink-dark: "oklch(0.95 0.006 250)"
  ink-soft-dark: "oklch(0.72 0.02 252)"
  rule-dark: "oklch(0.31 0.016 255)"
  vermilion-dark: "oklch(0.69 0.17 36)"
  vermilion-tint-dark: "oklch(0.29 0.06 34)"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.5rem + 4.2vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.4rem + 1.2vw, 2.375rem)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: 1.37
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.54
  figure:
    fontFamily: "Spline Sans Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.54
    letterSpacing: "-0.01em"
    fontFeature: "'tnum', 'zero'"
  label:
    fontFamily: "Spline Sans Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.06em"
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
spacing:
  px: "1px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
  "24": "96px"
  "32": "128px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.on-vermilion}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.vermilion-pressed}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  citation-mark:
    backgroundColor: "{colors.vermilion-tint}"
    textColor: "{colors.vermilion}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "0 4px"
  tag:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
---

# Design System: DocGenie

This file is the forward-looking system, not a scan of the old UI. PRODUCT.md says who it is for and why; this file says how it looks and moves. Light values are the canonical ones; dark values are listed with a `-dark` suffix in the frontmatter and as the `.dark` block in `src/app/globals.css`.

**Which sections a later phase reads before building a surface**

| Surface | Read |
|---|---|
| Any UI | Overview (grid, spacing, motion), Colors (The One Mark Rule), Do's and Don'ts |
| Chat UI, document viewer (Phase 7) | Typography (figures), Components (citation mark, panel, tag), Overview (motion in the app) |
| Dashboard, documents list, settings, auth, shared primitives (Phase 8) | Components, Elevation, Typography (hierarchy) |
| Landing and marketing (Phase 9) | Overview (layout, hero sequence, scroll reveals), Typography (display), Do's and Don'ts |

## 1. Overview

**Creative North Star: "The Reviewer's Desk"**

A reviewer at a desk, in daylight, with the document and a red pencil. The page is cool graphite paper, the text is dense ink, structure is drawn with hairline rules like a printed engineering datasheet, and the single vermilion mark appears only where the reviewer pointed: on the thing you can act on, the thing you selected, the passage an answer cites. Everything else is quiet because the product itself is the proof, so the site shows real machinery (a citation opening its source, retrieval timings, token counts) instead of describing it.

The system is light first and fully supported in dark: dark is a considered night version of the same desk (blue-black paper, off-white ink, a lighter vermilion), never an inverted afterthought. It is dense and left-aligned, with a visible grid and varied section rhythm. It rejects what PRODUCT.md rejects: generic AI tool marketing, SaaS landing-page clichés, the previous emerald and its decorative serif, and stock shadcn slate.

**Key Characteristics:**
- Restrained color strategy: tinted neutrals carry 90% or more of every screen; one accent, rarely.
- Structure by hairline rule and whitespace, not by cards, shadows or color blocks.
- Two voices of type: a grotesk for words, a mono for data.
- Flat at rest; motion explains state changes and real sequence.
- Real product shown close up; never an illustration standing in for it.

### Grid and layout

- **Page container:** `page-container` (max 76rem = 1216px, 16px side gutters, 24px from 768px up). Use it on every page.
- **Columns:** `page-grid` is 4 columns below 768px and 12 columns from 768px up, 16px then 24px column gap. Children place with `col-span-*` and `col-start-*`. Text columns use `measure` (68ch) and never span the full 12.
- **Hairlines are the structure.** Separate sections and table-like rows with a 1px `border-rule` line (`border-t`, `divide-y`). Use `border-rule-strong` for the one line that carries a section's heading. Never use a cell background as the separator.
- **Alignment:** left-aligned by default. Centering is allowed only for a single short line or a control in an empty state. A centered stack of icon, heading and subtitle is forbidden.
- **Rhythm:** vary section spacing on purpose. Within a group use `gap-2` to `gap-4`; between groups `gap-8` to `gap-12`; between page sections alternate `py-16`, `py-24` and `py-32` so no two neighbours feel stamped from one mold. Tight groupings, generous separations.
- **App shell:** fixed sidebar 15rem (`w-60`) with a 1px right rule, content on the 12-column grid, 44px minimum touch height on mobile controls, rows 40px with a bottom hairline.
- **Breakpoints:** Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). Design mobile-first; the grid collapses to 4 columns and tables become stacked rows with the figure column kept right-aligned.

### Spacing

4px base. Scale in use: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 (Tailwind `1, 2, 3, 4, 6, 8, 12, 16, 24, 32`). Do not introduce 5, 10, 14 or arbitrary pixel values. Control height is 36px (`h-9`), 32px (`h-8`) in dense toolbars, 40px (`h-10`) for the primary action on a marketing surface.

### Motion

Library: `motion` (`motion/react`). Shared tokens are in `src/lib/motion.ts` and mirrored as CSS tokens (`--ease-out-expo`, `--ease-out-quart`). `MotionProvider` (mounted in the root layout) sets `reducedMotion="user"`.

- **In the app:** 150 to 250 ms state transitions only (hover, focus, select, expand, toast, panel open). Ease `ease-out-expo` for entrances and `ease-out-quart` for color changes. Nothing loops except the loading indicator.
- **Marketing:** exactly one orchestrated hero sequence (Phase 9), and scroll-linked reveals on the pipeline section where each step appears in the order the machinery actually runs. Reveal duration 600 ms, rise of at most 12px.
- **Never animate layout properties** (width, height, top, left, margin, padding). Animate `opacity` and `transform` only. For expanding sections transition `grid-template-rows` (0fr to 1fr).
- **No bounce, no elastic, no spring overshoot.** Exponential ease-out only.
- **Reduced motion:** the CSS rule in `globals.css` collapses transitions and keyframes, and `MotionConfig` drops transform and layout animation. **Content is visible by default**: a reveal starts hidden only when driven by `whileInView` or `animate`, so failed scripts, print and reduced motion all show the content.
- **Motion carries meaning.** A streaming answer, a citation opening its source, a document moving from processing to ready. Decorative motion is cut.

## 2. Colors

A cool graphite paper-and-ink palette with one red-pencil vermilion. Strategy: **Restrained**. The accent stays at or under about 10% of any screen.

### Primary
- **Vermilion** (`oklch(0.55 0.19 34)`, dark `oklch(0.69 0.17 36)`): the reviewer's red pencil. Primary buttons, links, the selected state, the focus ring, citation marks and nothing else. Token `brand` (utility `bg-brand`, `text-brand`); `primary` is an alias so stock shadcn primitives resolve to it. White-ish text on it is 5.1:1 in light; dark ink on it is 6.5:1 in dark.
- **Vermilion pressed** (`oklch(0.49 0.18 34)`): hover and active fill for the primary button (`bg-brand-hover`).
- **Vermilion tint** (`oklch(0.95 0.025 34)`, dark `oklch(0.29 0.06 34)`): the highlight behind a selected passage, a text selection, the background of a citation mark (`bg-brand-subtle`).

### Neutral
- **Paper** (`oklch(0.985 0.004 250)`, dark `oklch(0.17 0.015 255)`): page background (`bg-background`). Never pure white or black.
- **Surface** (`oklch(0.992 0.003 250)`, dark `oklch(0.205 0.017 255)`): panels, popovers, the chat composer (`bg-card`). One step off paper, so it reads only because of its hairline.
- **Wash** (`oklch(0.962 0.006 250)`, dark `oklch(0.235 0.016 255)`): muted and secondary fills, table header rows (`bg-muted`, `bg-secondary`). Hover wash `oklch(0.945 0.008 250)` is `bg-accent` (shadcn's `accent` is this neutral, **not** the brand).
- **Ink** (`oklch(0.205 0.02 255)`, dark `oklch(0.95 0.006 250)`): primary text (`text-foreground`), 17:1 on paper.
- **Ink soft** (`oklch(0.48 0.022 255)`, dark `oklch(0.72 0.02 252)`): secondary text, captions, labels (`text-muted-foreground`), 6.3:1 on paper, 7.7:1 in dark.
- **Rule** (`oklch(0.895 0.008 250)`, dark `oklch(0.31 0.016 255)`): hairlines and panel borders (`border-border` or `border-rule`). Decorative; never the only edge of an interactive control.
- **Rule strong** (`oklch(0.78 0.012 252)`, dark `oklch(0.42 0.018 255)`): the one heavier line per section (`border-rule-strong`).
- **Control edge** (`oklch(0.63 0.02 252)`, dark `oklch(0.52 0.02 255)`): the border of inputs and outlined buttons (`border-input`), at least 3:1 against paper.

### Status (small marks only, always with an icon or word)
- **Crimson** (`oklch(0.5 0.2 18)`, dark `oklch(0.7 0.18 20)`): destructive actions and error text (`bg-destructive`, `text-destructive`). Darker and bluer than vermilion on purpose; the two are never adjacent without an icon.
- **Proof green** (`oklch(0.5 0.12 145)`, dark `oklch(0.74 0.14 145)`): a ready document, a succeeded step (`text-success`). A status mark, never a surface or a brand color.
- **Amber flag** (`oklch(0.54 0.1 70)`, dark `oklch(0.78 0.13 75)`): low credits, an incomplete answer (`text-warning`).

### Data
Chart series use a lightness ramp of ink (`chart-2` to `chart-5`) and reserve `chart-1` (vermilion) for the single series that matters.

### Named Rules
**The One Mark Rule.** Vermilion marks what you can act on, what you selected, or where an answer came from. If a vermilion element has none of those jobs, it is decoration and it is removed. Its rarity is the point.

**The No Raw Palette Rule.** Components never use Tailwind palette classes (`emerald-600`, `slate-900`, `bg-white`, `text-black`) or hex values. Only the semantic tokens above. A new need gets a new token in `globals.css`, not a one-off.

**The Tinted Neutral Rule.** Neutrals carry chroma 0.003 to 0.025 at hue 250 to 255 (cool graphite), so ink and paper sit coolly against the warm vermilion. No `#000`, no `#fff`.

**The Not-Color-Alone Rule.** Every status and every vermilion mark pairs the color with a form: a box, an underline, an icon, or a word.

## 3. Typography

**Display and UI Font:** Schibsted Grotesk (variable 400 to 900, with `ui-sans-serif, system-ui` fallback). Loaded with `next/font/google` as `--font-schibsted`, available as `font-sans`.
**Figure and Label Font:** Spline Sans Mono (variable 300 to 700, with `ui-monospace` fallback). Loaded as `--font-spline-mono`, available as `font-mono`.

**Character:** Schibsted Grotesk is a sturdy, slightly condensed news grotesk with firm terminals, closer to a typeset datasheet than a product-marketing geometric. Its weight range lets one family carry display down to caption through contrast alone. Spline Sans Mono is compact and even, with clear tabular figures and a slashed zero, so columns of timings and counts align and read as data, not costume.

**Selection (font procedure record).** Voice words: exact, annotated, unhurried; physical object: a printed engineering datasheet with a ruled figure table. Reflex picks rejected: Inter, IBM Plex Sans and Mono, Space Grotesk, DM Sans (all on the skill's reflex list), and the previous DM Serif Display and Geist. Candidates weighed against a datasheet: Hanken Grotesk (too neutral), Public Sans (too institutional), Azeret Mono and Martian Mono (too wide for dense figure tables). Schibsted Grotesk plus Spline Sans Mono won on character, weight range and availability through `next/font`.

### Hierarchy
Ratio 1.25 from a 15px body. Utilities are defined in `globals.css` (`text-display`, `text-section`, `text-headline`, `text-title`, `text-body`, `text-body-sm`, `text-caption`, `text-label`).
- **Display** (700, `clamp(2.5rem, 1.5rem + 4.2vw, 4.75rem)`, line-height 1, tracking -0.02em): the marketing hero and nothing else. One per page.
- **Section** (650, `clamp(1.75rem, 1.4rem + 1.2vw, 2.375rem)`, 1.12): marketing section headings and the app page title on large screens.
- **Headline** (650, 24px, 1.25): app page titles, dialog titles, empty-state headings.
- **Title** (600, 19px, 1.37): panel and list-group titles, chat session titles.
- **Body** (400, 15px, 1.6, max 68ch): all running text, chat answers, form copy.
- **Body small** (400, 13px, 1.54): table cells, helper text, secondary rows.
- **Figure** (mono 500, 13px, tabular and slashed zero): timings (`412 ms`), token counts (`1,842`), page refs (`p.14`), credit counts (`23 / 25`), file sizes. Utility `figure`. Use it at any size; set the surrounding label in sans.
- **Label** (mono 500, 11px, tracking 0.06em, uppercase): short legend captions above a figure or a column (`CREDITS`, `RETRIEVAL`). Utility `ds-label`. Two words at most. Never body copy, never a heading.

### Named Rules
**The Mono Carries Data Rule.** Spline Sans Mono appears only on figures and legend labels. It is never used for decorative "technical" flavor, headings, buttons or running text. If a number is on screen, it is a figure.

**The One Family Rule.** All words, including display, are Schibsted Grotesk. No serif, no italic display, no second sans. Emphasis is weight or size, never a different typeface.

**The Scale Contrast Rule.** Adjacent hierarchy steps differ by at least 1.25 in size or 100 in weight. Flat scales read as uncommitted.

**The Dark Leading Rule.** In dark mode add 0.05 to body line-height where long text appears; light type reads lighter and needs room.

## 4. Elevation

The system is flat. Depth comes from a one-step surface change and a 1px hairline, not from shadows. `shadow-2xs`, `shadow-xs` and `shadow-sm` are set to `none` in the theme, so stock primitives that still carry those classes render flat.

### Shadow Vocabulary
- **Overlay** (`shadow-md`: `0 8px 24px -8px oklch(0.2 0.02 255 / 0.18), 0 0 0 1px oklch(0.2 0.02 255 / 0.06)`): popovers, dropdowns and tooltips that float above content. Dark mode uses a black-based equivalent.
- **Modal** (`shadow-lg`: `0 16px 40px -12px oklch(0.2 0.02 255 / 0.22), 0 0 0 1px oklch(0.2 0.02 255 / 0.06)`): dialogs and sheets only, over the `bg-overlay` scrim.

### Named Rules
**The Flat-By-Default Rule.** Surfaces at rest have no shadow. A shadow appears only on something that floats above the page. If it looks like a 2014 app, the shadow is too dark and the blur too small.

**The Hairline Over Fill Rule.** To separate two regions, draw a 1px rule before reaching for a background tint, and a background tint before reaching for a shadow.

## 5. Components

Character: tactile-precise and unadorned. Small radii (4px controls, 6px panels), crisp edges, honest states. Nothing is pill-shaped.

### Buttons
- **Shape:** 4px radius (`rounded-md`), 36px high, 16px horizontal padding, 14px medium-weight label.
- **Primary:** vermilion fill with `on-vermilion` text. One per view region. Hover is vermilion pressed. Disabled is 50% opacity.
- **Outline:** paper fill, 1px control-edge border, ink text. The default for secondary actions. Hover fills with hover wash.
- **Secondary:** wash fill, ink text. Quiet in-toolbar actions.
- **Ghost / link:** no fill; hover wash. Link text is vermilion with a 4px underline offset on hover.
- **Destructive:** crimson fill, `destructive-foreground` text, always with a trash or alert icon or the word "Delete".
- **Focus:** 3px ring in vermilion at 50% opacity plus a vermilion border, shown with `:focus-visible` only.
- **Transition:** color only, 150 ms, `ease-out-quart`. No transform, no layout change.

### Inputs / Fields
- **Style:** transparent fill, 1px control-edge border, 4px radius, 36px high, placeholder in ink soft. Labels sit above in sans 13px medium, never as placeholders.
- **Focus:** vermilion border and the 3px 50% ring. **Error:** crimson border and ring plus an icon and a message beneath in crimson text. **Disabled:** 50% opacity, no pointer events.

### Panels (replaces "cards")
- **Corner style:** 6px radius. **Background:** surface. **Border:** 1px rule. **Shadow:** none. **Padding:** 24px (16px on mobile, 12px in dense lists).
- A panel is used only when a region needs to be a self-contained object (a credit summary, a document row's detail, the chat composer). Most content sits directly on paper separated by hairlines. Panels never nest, and a grid of identical panels with an icon, heading and sentence is forbidden.

### Tags (replaces "badges")
- **Style:** wash fill, ink soft text, label type (mono 11px uppercase), 3px radius, 2px by 6px padding. Never pill-shaped, never a vermilion fill.
- **Use:** document type (`PDF`, `CSV`), status words (`READY`, `PROCESSING`) paired with a status-colored 1px square or icon. State uses the status colors only on the mark, not the fill.

### Citation mark (signature component)
- **Style:** the inline reference in an answer, such as `p.14` or `3`. Label type, vermilion text on vermilion tint with a 1px vermilion border, 2px radius, 4px horizontal padding, sitting on the text baseline.
- **Behavior:** a button. Hover and focus raise the border to full vermilion; activate opens the source viewer at that page and highlights the passage in vermilion tint. A visible focus ring is required. The mark is also reachable by keyboard in reading order.
- It is the one place the accent is allowed to repeat many times in a screen; each mark is small and each carries meaning.

### Figure row (signature component)
- **Style:** a legend label above a mono figure, optionally with a unit in ink soft: `RETRIEVAL` over `412 ms`. Right-aligned figures in tables. Hairline below the row.
- **Use:** timings, token counts and credit balances in the chat footer, the dashboard and the pipeline section. Never styled as a hero metric (no oversize number with a gradient or supporting stats).

### Navigation
- **App sidebar:** 15rem, paper-tinted `sidebar` fill, 1px right rule. Items are 36px rows, 14px sans, an icon at 16px. The active item is semibold ink text on hover wash with its icon in vermilion (selection is one of the accent's jobs). Hover is hover wash. No pill highlight and no colored side stripe.
- **Marketing navbar:** a single row on paper with a bottom hairline, left wordmark, links in sans 14px, primary button on the right. It does not float, blur or shrink on scroll.
- **Mobile:** the sidebar becomes a sheet; the navbar collapses to the wordmark and a menu button.

### Dialogs, sheets, popovers
Use inline and progressive alternatives first. When a dialog is truly needed: 6px radius, surface fill, modal shadow, `bg-overlay` scrim, 200 ms fade and 8px rise. Close button top right, focus trapped, Esc closes.

### Toasts
Bottom right (sonner), surface fill, 1px rule, 6px radius, status icon plus text. Rich colors stay on, but status color never replaces the icon or wording.

### Tables and lists
Header row in wash with label-type column titles; rows 40px with a bottom hairline; no zebra, no outer border box; figure columns right-aligned in mono. Row hover is hover wash. Selected row uses vermilion tint.

## 6. Do's and Don'ts

### Do:
- **Do** show the real machinery: a citation opening its source, real retrieval timings and token counts, the actual UI close up and in context.
- **Do** spend the vermilion like a reviewer's red pencil: actions, selection, citation marks (The One Mark Rule). Keep it at or under about 10% of any screen.
- **Do** set every number in Spline Sans Mono with tabular figures (`figure`), and every legend label in `ds-label`.
- **Do** build structure with 1px `border-rule` hairlines and the 12-column grid; left-align; vary section spacing between 64, 96 and 128px.
- **Do** use only semantic tokens (`bg-background`, `text-muted-foreground`, `border-rule`, `bg-brand`). A new color is added as a token in `globals.css` first.
- **Do** pair every status and mark with an icon or word, and keep contrast at 4.5:1 for text and 3:1 for controls and focus, checked in light and dark.
- **Do** keep motion to `opacity` and `transform` with exponential ease-out, 150 to 250 ms in the app, and keep content visible by default with `prefers-reduced-motion` honored.
- **Do** write copy without em dashes (use commas, colons, semicolons, periods or parentheses) and without restating the heading in the text beneath it.

### Don't:
- **Don't** use generic AI tool marketing: glow blobs, gradient text (`background-clip: text` with a gradient), sparkle icons, "supercharge your workflow", dark mode with purple or neon accents.
- **Don't** use SaaS landing-page clichés: the centered hero stack, icon-card triplets, repeated eyebrow / H2 / subhead stacks, big-number-and-small-label hero metrics, dot-grid or mesh backgrounds, glassmorphism.
- **Don't** use pill badges or fully rounded buttons. Radii stay 2 to 6px (8px only on a large container).
- **Don't** use emerald, teal-green or the AI-purple as a brand color. Green appears only as the small proof-green status mark.
- **Don't** use `border-left` or `border-right` wider than 1px as a colored accent stripe on cards, list items, callouts or alerts. Use a full hairline, a tint, a leading mark or nothing.
- **Don't** nest panels, wrap everything in a container, or build an identical card grid. Cards are the lazy answer.
- **Don't** use a serif, an italic display face, or any decorative display type (the previous DM Serif Display). One family for words, one mono for figures.
- **Don't** use raw palette classes (`emerald-600`, `slate-900`), `#000`, `#fff`, or hex values in components.
- **Don't** animate layout properties (width, height, top, left, margin, padding), and don't use bounce, elastic or spring overshoot. Don't loop decorative motion.
- **Don't** open a modal as a first thought; exhaust inline and progressive alternatives first.
- **Don't** show a mock-up that cannot be used, a browser-frame illustration in place of the product, or stock imagery. The product is the image.
- **Don't** convey meaning by color alone (vermilion or status) or by motion alone.

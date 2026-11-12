# Product

## Register

brand

## Users

Two groups, in this order of weight.

**Evaluators.** Prospective clients and employers judging the engineering quality of the person who built DocGenie. They arrive from a link in a message, a CV or a proposal. They sit at a desk in daylight, often with the site open next to a PDF (the CV, a brief). They give it a few minutes, read closely, and notice what is faked. They are technical enough to tell a real retrieval pipeline from a mock-up, and they have seen a thousand AI landing pages.

**Signed-in users.** People who upload documents (PDF, DOCX, TXT, CSV) and ask questions. They are mid-task: they need an answer from a file, they want to see where in the file it came from, and they want to know what it cost them in credits. Most of them are the same evaluators, one click further in.

Job to be done: the evaluator decides "this person ships careful, working systems"; the user gets a correct, cited answer from their own document.

## Product Purpose

DocGenie lets you chat with your documents. Answers are grounded in the uploaded file, cite the page or passage they came from, and open the source on click. It reads scanned PDFs (OCR), answers numeric questions over CSV with real queries instead of guessing, and shows its own work: tool calls, retrieval, timings and token counts.

The product is also the proof. The site does not describe the engineering, it shows it: the real pipeline, real measurements, real UI up close. Success is an evaluator who stops reading about the system and starts using it.

## Brand Personality

Exact, annotated, unhurried.

A reviewer's desk, not a pitch deck. The voice is plain, specific and unembellished: numbers instead of adjectives, names of real mechanisms instead of "AI-powered". It marks things up like a careful reviewer (a small red mark where it matters) and leaves the rest quiet. Confident because it can show the work, never loud about it.

Emotional goals: trust, the sense of a competent hand, a little pleasure in the precision.

Reference lane: **precise technical.** Linear's product pages (the real UI shown close up, not illustrated), Stripe docs (clarity and density without clutter), and a printed engineering datasheet (ruled lines, small labelled figures, nothing decorative).

## Anti-references

- Generic AI tool marketing: glow blobs, gradient text, sparkle icons, "supercharge your workflow", dark mode with purple or neon accents.
- SaaS landing-page clichés: the centered hero stack, the three icon cards in a row, the repeated eyebrow / H2 / subhead block, pill badges, dot-grid backgrounds, a big-number-and-small-label metric strip.
- Emerald and its green-teal cousins as the brand color (the previous version of this site), and the AI-purple reflex.
- Mock UI in a browser frame that cannot be used. Illustrations in place of the product.
- Stock shadcn slate with no point of view.
- Decorative serif display type (the previous version used one).

## Design Principles

1. **Show the machinery.** If something can be shown running (a citation opening its source, retrieval timings, a tool call), show that instead of describing it. A claim on the page is backed by something on the page.
2. **Mark, don't decorate.** One accent, spent like a reviewer's red pencil: on actions, on selection, on citation marks. Everything else is ink on paper. If the accent appears for atmosphere, remove it.
3. **Numbers are content.** Timings, token counts, page references and credit balances are real data. They are set in a real mono, tabular and aligned, and never rounded into vague adjectives.
4. **Structure is visible.** A strict grid with hairline rules does the work that cards, shadows and color blocks do elsewhere. Layout is left-aligned and varied in rhythm, never a centered stack.
5. **Quiet by default, exact on demand.** The app (dashboard, chat, documents) is task-first and dense; the marketing surface is allowed one orchestrated moment. Motion explains a state change or reveals real sequence. It never performs.

Register note: the default register is brand because the site's first job is to convince. App surfaces (dashboard, chat, documents, settings) are designed in the product register and follow the same tokens.

## Accessibility & Inclusion

- WCAG 2.2 AA minimum. Text contrast at least 4.5:1 in both themes; interactive and focus indicators at least 3:1. The brand color is never the only carrier of meaning: status always has an icon or a word.
- Light first, dark fully supported and checked, not inverted. Theme follows the system and can be switched manually.
- `prefers-reduced-motion` is fully honored. Content is visible by default; animation only enhances. No information is conveyed by motion alone.
- Full keyboard operation with visible focus. Citation marks, the source viewer and the chat composer must be reachable and usable without a pointer.
- Color-blind safe: red-pencil vermilion is paired with form (a boxed mark, an underline, an icon), and charts use lightness steps rather than hue alone.
- Plain-language error and empty states that say what happened and what to do next.

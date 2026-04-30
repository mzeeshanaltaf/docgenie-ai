# SEO Optimization Plan — DocGenie

## Context

DocGenie is live at https://docgenie.zeeshanai.cloud. The site has a solid foundation (Next.js 16 App Router, Clerk auth, server-rendered marketing pages, base metadata in root layout, semantic HTML, dark mode, lighthouse-friendly font loading via next/font), but is **missing several critical SEO primitives** that will block discoverability and rich-result eligibility:

**Audited findings (from code + live fetch):**
- `https://docgenie.zeeshanai.cloud/robots.txt` → **404 (missing)**
- `https://docgenie.zeeshanai.cloud/sitemap.xml` → **404 (missing)**
- No structured data (JSON-LD) anywhere — no `SoftwareApplication`, `Organization`, `FAQPage`, or `BreadcrumbList`
- No `alternates.canonical` set on any page
- No Open Graph image — `twitter.card` is `summary_large_image` but no image is referenced
- No `apple-icon` / `icon` exports in `src/app/`
- Leftover Next.js boilerplate SVGs in `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) — clutter, no SEO value
- No explicit `viewport` metadata export (relies on Next.js default)
- Dashboard routes have no `robots: { index: false }` — they're auth-gated so Google can't crawl them, but explicit noindex is defense-in-depth
- No HSTS header (security signal Google considers)
- Landing page has no FAQ section — missed opportunity for `FAQPage` schema and long-tail keywords
- No `<img>` tags on landing page (good — uses Lucide SVG icons), so no alt-text issues

**What's already correct:**
- `<html lang="en">`
- Solid base `metadata` in [src/app/layout.tsx](src/app/layout.tsx) (title template, description, OG, Twitter, robots:true, metadataBase)
- Per-page metadata on `/about`, `/privacy`, `/terms`
- Server-rendered marketing pages (no SSR/CSR mismatch for crawlers)
- HTTPS, valid SSL
- Mobile-responsive (Tailwind v4)
- Security headers in `next.config.ts` (X-Frame-Options, etc.)
- Semantic landmarks: `<Navbar>`, `<main>`, `<Footer>`
- Single H1 per page, logical H2 hierarchy

**Goal:** Get DocGenie indexed cleanly, eligible for rich results in Google, and improve crawl efficiency. No content rewrites — only technical/infrastructure SEO.

---

## Plan

### Priority 1: Critical (blocking indexation & discoverability)

#### 1.1 Generate robots.txt — `src/app/robots.ts` (new file)

Use Next.js's [MetadataRoute.Robots](https://nextjs.org/docs/app/api-reference/functions/metadata#robots) convention.

- Allow all bots on marketing routes (`/`, `/about`, `/privacy`, `/terms`)
- Disallow `/dashboard/*` and `/api/*`
- Reference sitemap: `https://docgenie.zeeshanai.cloud/sitemap.xml`
- Single source of truth — replaces any need for a static `public/robots.txt`

#### 1.2 Generate sitemap.xml — `src/app/sitemap.ts` (new file)

Use [MetadataRoute.Sitemap](https://nextjs.org/docs/app/api-reference/functions/metadata#sitemap).

- Include the four public marketing URLs: `/`, `/about`, `/privacy`, `/terms`
- Set `changeFrequency` (`weekly` for `/`, `yearly` for legal pages, `monthly` for `/about`)
- Set `priority` (`1.0`, `0.7`, `0.3`, `0.3`)
- Set `lastModified` to the build date

#### 1.3 Add canonical URLs to all public pages

- Root layout already has `metadataBase` — leverage that
- Add `alternates.canonical` to:
  - `src/app/(marketing)/page.tsx` (new metadata export — uses default title from layout but adds `alternates.canonical: "/"`)
  - `src/app/(marketing)/about/page.tsx` (`alternates.canonical: "/about"`)
  - `src/app/(marketing)/privacy/page.tsx` (`alternates.canonical: "/privacy"`)
  - `src/app/(marketing)/terms/page.tsx` (`alternates.canonical: "/terms"`)

#### 1.4 Generate Open Graph image — `src/app/opengraph-image.tsx` (new file)

Use Next.js's [opengraph-image convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image) with `ImageResponse` from `next/og`:
- Size: 1200×630
- Content: "DocGenie" wordmark + tagline "Chat With Your Documents" on emerald-to-slate gradient
- Reuse the `BookOpen` lucide icon for visual consistency
- Also create `src/app/twitter-image.tsx` (or alias from same file)

This auto-applies to all routes via root-layout inheritance and is referenced by `og:image` and `twitter:image` automatically.

---

### Priority 2: High-impact (rich results & relevance signals)

#### 2.1 Add JSON-LD structured data

Create `src/components/seo/json-ld.tsx` — a tiny client-safe component that emits `<script type="application/ld+json">{...}</script>`. Insert into:

- **Root layout** (`src/app/layout.tsx`) — `Organization` schema (name, url, logo, sameAs links if any)
- **Landing page** (`src/app/(marketing)/page.tsx`) — `SoftwareApplication` schema:
  - `name: "DocGenie"`
  - `applicationCategory: "BusinessApplication"`
  - `operatingSystem: "Web"`
  - `offers`: free tier (5 documents, 25 messages)
  - `description`, `url`
- **About / Privacy / Terms** — `BreadcrumbList` schema (Home → Page)
- **Landing page** (after FAQ section is added — see 3.1) — `FAQPage` schema with all Q&A

Since DocGenie is server-rendered, the JSON-LD will be in the static HTML and detectable by Google (no `web_fetch` blind-spot issue).

#### 2.2 Per-page unique metadata for landing

Currently the landing page inherits the layout default. Add an explicit metadata export to `src/app/(marketing)/page.tsx`:
- Optimized `description` with primary keyword "chat with PDF", "AI document Q&A", "ask questions about documents"
- `alternates.canonical: "/"`

#### 2.3 Add `app/icon.png` and `app/apple-icon.png`

Replace the legacy `favicon.ico` system with Next.js's [icon convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons) — generates correct `<link rel="icon">` and `<link rel="apple-touch-icon">` tags. Use the existing `BookOpen` brand mark or a simple emerald-on-white "D" rendered via `ImageResponse` in `src/app/icon.tsx`.

#### 2.4 Explicit viewport export

Add `export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#020817" }] }` to `src/app/layout.tsx`. Improves PWA scoring and theme-color rendering in Safari/mobile.

---

### Priority 3: Quick wins

#### 3.1 Add FAQ section to landing page

Add a new `<section id="faq">` in `src/app/(marketing)/page.tsx` between Pricing and CTA, with 5–7 common questions. Examples:
- "What file types does DocGenie support?"
- "How long does it take to process a document?"
- "Is my data private?"
- "Can I delete my documents?"
- "How does pricing work?"
- "What AI does DocGenie use?"

Then add `FAQPage` JSON-LD with these exact Q&As (see 2.1). Eligible for rich-result expansion in SERPs.

#### 3.2 Noindex dashboard

Add `metadata` export to `src/app/(dashboard)/layout.tsx` with `robots: { index: false, follow: false }`. Belt-and-suspenders alongside Clerk middleware.

#### 3.3 Clean up `public/` boilerplate

Delete unused Next.js demo SVGs:
- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Reduces deployment size and signals a maintained codebase.

#### 3.4 Add HSTS header

Add to `securityHeaders` in [next.config.ts](next.config.ts):
```ts
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
```
Google considers HSTS a positive trust signal.

---

### Priority 4: Long-term (out of scope for this PR — flagged for later)

- **Blog/Changelog content** — `/blog` route with MDX posts targeting "how to chat with PDF", "alternatives to ChatPDF", etc. Largest organic-traffic lever for SaaS.
- **Comparison pages** — `/vs/chatpdf`, `/vs/notebooklm` — high commercial intent.
- **Programmatic landing pages** for use cases: `/for/lawyers`, `/for/students`, `/for/researchers`.
- **Submit to Google Search Console** — verify ownership and submit sitemap.
- **Backlink building** — beyond engineering scope.
- **Lighthouse audit** — run after deploy to verify CWV (LCP < 2.5s, INP < 200ms, CLS < 0.1).

---

## Critical Files to Create/Modify

**Create:**
- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/app/opengraph-image.tsx`
- `src/app/icon.tsx` (or `app/icon.png`)
- `src/app/apple-icon.tsx` (or `app/apple-icon.png`)
- `src/components/seo/json-ld.tsx`

**Modify:**
- [src/app/layout.tsx](src/app/layout.tsx) — add `viewport` export, mount `Organization` JSON-LD
- [src/app/(marketing)/page.tsx](src/app/(marketing)/page.tsx) — add `metadata` export with canonical, add FAQ section, mount `SoftwareApplication` + `FAQPage` JSON-LD
- [src/app/(marketing)/about/page.tsx](src/app/(marketing)/about/page.tsx) — add `alternates.canonical`, mount `BreadcrumbList` JSON-LD
- [src/app/(marketing)/privacy/page.tsx](src/app/(marketing)/privacy/page.tsx) — same as above
- [src/app/(marketing)/terms/page.tsx](src/app/(marketing)/terms/page.tsx) — same as above
- [src/app/(dashboard)/layout.tsx](src/app/(dashboard)/layout.tsx) — add `metadata` with `robots: { index: false }`
- [next.config.ts](next.config.ts) — add HSTS header

**Delete:**
- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

---

## Verification

After implementation, verify:

1. **Build succeeds:** `npm run build` and `npx tsc --noEmit`
2. **robots.txt:** Visit `https://docgenie.zeeshanai.cloud/robots.txt` — should return 200 with sitemap reference
3. **sitemap.xml:** Visit `https://docgenie.zeeshanai.cloud/sitemap.xml` — should list 4 URLs
4. **OG image:** Visit `https://docgenie.zeeshanai.cloud/opengraph-image` — returns PNG; test the URL in [opengraph.xyz](https://www.opengraph.xyz/) and [Twitter Card Validator](https://cards-dev.twitter.com/validator)
5. **Structured data:** Test the live URL at [Google Rich Results Test](https://search.google.com/test/rich-results) — should detect `Organization`, `SoftwareApplication`, `FAQPage`
6. **Canonical:** View source on each page, confirm `<link rel="canonical" href="...">` matches the page URL
7. **Lighthouse:** Run Lighthouse on the live site — SEO score should be 100, no warnings on indexability/canonicals/structured-data
8. **Mobile-friendly:** Test at [Google Mobile-Friendly Test](https://search.google.com/test/mobile-friendly)
9. **Submit to GSC:** Add property in Search Console, submit sitemap, request indexing for the four URLs

---

## Implementation Order

1. Create robots.ts + sitemap.ts (smallest, biggest unblock)
2. Add canonicals to all marketing pages
3. Create opengraph-image.tsx + icon.tsx + apple-icon.tsx
4. Create json-ld.tsx component + add Organization to root layout
5. Add SoftwareApplication + BreadcrumbList JSON-LD to marketing pages
6. Add viewport export + dashboard noindex
7. Add HSTS header in next.config.ts
8. Add FAQ section + FAQPage JSON-LD to landing
9. Delete unused public/ SVGs
10. Build, type-check, manual verify, push

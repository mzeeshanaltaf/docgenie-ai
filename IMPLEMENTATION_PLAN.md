# ResuMatchAI — Implementation Plan

## Context
The Next.js SaaS boilerplate is complete and running at `http://127.0.0.1:3000`. This plan covers two sequential phases:
- **Phase 1:** Redesign the landing page using the `frontend-design` skill for production-grade quality
- **Phase 2:** Implement all application features — n8n integration, API routes, dashboard pages

**n8n backend:** 5 webhook workflows (already implemented) handle all AI logic, data storage, and credit management. Next.js is the thin API proxy layer.

**Skills to apply:**
- `frontend-design` — Phase 1 (landing page redesign)
- `vercel-react-best-practices` — Phase 2 (all dashboard pages and components)

**Dark mode:** Added via `next-themes`. Implemented before the landing page redesign so all UI is authored with both themes in mind from the start.

---

## n8n Webhook Contract

All webhooks: `POST {N8N_WEBHOOK_BASE_URL}/{uuid}` with header `x-api-key: {N8N_API_KEY}`

| Workflow | Env Var | UUID | Event Types |
|---|---|---|---|
| **Main** | `N8N_MAIN_WEBHOOK_ID` | `279f5964-5445-4b94-bae3-9a6d29f0dddb` | `process_resume`, `scrape_jd`, `resume_match` |
| **Analytics** | `N8N_ANALYTICS_WEBHOOK_ID` | `85e48153-e99d-40cc-9663-a7c0fd845c44` | `user_analytics`, `all_analytics` |
| **Credits** | `N8N_CREDITS_WEBHOOK_ID` | `1543b332-7b5f-4338-a390-74767805c396` | `signup_credits`, `get_remaining_credit`, `credit_history` |
| **Data** | `N8N_DATA_WEBHOOK_ID` | `26dee7a9-19a0-4f65-af48-506384f50370` | `get_resume`, `get_jds`, `get_job_match_summary` |
| **Delete** | `N8N_DELETE_WEBHOOK_ID` | `2df21026-2a38-4b57-9399-cc9fc848388f` | `delete_resume`, `delete_jd`, `delete_job_match_summary` |

Every JSON body must include `event_type` as the internal router field for n8n switch nodes.

---

## Phase 1: Landing Page Redesign

### Step 0: Dark Mode Setup (do this before any UI work)

**Goal:** Wire up system-aware dark mode with a user toggle. All subsequent UI is authored with both themes in mind.

**Package to install:**
```bash
npm install next-themes
```

**Files to create/modify:**

| File | Action | Purpose |
|---|---|---|
| `src/components/theme-provider.tsx` | **Create** | Thin wrapper re-exporting `ThemeProvider` from next-themes as a Client Component |
| `src/app/layout.tsx` | **Modify** | Wrap `<body>` children with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` |
| `src/components/ui/theme-toggle.tsx` | **Create** | Sun/Moon icon button using shadcn `Button` (variant ghost, size icon); cycles light → dark → system |
| `src/components/marketing/navbar.tsx` | **Modify** | Add `<ThemeToggle />` in the right-side action area (before auth buttons) |
| `src/components/dashboard/top-nav.tsx` | **Modify** | Add `<ThemeToggle />` next to `<UserButton />` |

**How it works:**
- `next-themes` uses the `class` attribute strategy: adds `dark` class to `<html>` when dark mode is active
- Tailwind CSS v4 + shadcn/ui CSS variables already have `.dark { ... }` variants in `globals.css` — no Tailwind config changes needed
- `suppressHydrationWarning` must be added to `<html>` in root layout (next-themes sets class client-side)
- Default: respects OS system preference; user toggle persists to `localStorage`

**`theme-provider.tsx` pattern:**
```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

**`theme-toggle.tsx` pattern:**
```tsx
"use client";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
// Toggle between "light" and "dark"; show Moon when light, Sun when dark
```

**Verification:** Toggle in navbar switches between light and dark; preference persists on page reload.

---

### Step 1: Landing Page Visual Redesign

**Goal:** Transform the existing functional landing page into a distinctive, production-grade marketing site using the `frontend-design` skill.

**Invoke:** `frontend-design` skill on the landing page. Design must look great in both light and dark modes.

**Sections to redesign:**

| Section | Current State | Target |
|---|---|---|
| **Navbar** | Basic sticky nav | Polished with blur backdrop, smooth hover states |
| **Hero** | Simple headline + CTAs | Strong visual hierarchy, compelling copy, gradient accents |
| **Features** | 3-card grid | Distinctive card design with icon treatments |
| **How It Works** | Numbered steps | Visual step flow with connecting elements |
| **Pricing** | Placeholder tier cards | Polished pricing cards with feature lists, highlighted Pro tier |
| **CTA Banner** | Basic banner | High-contrast conversion section |
| **Footer** | 4-column links | Clean footer with brand presence |

**Files affected:**
- `src/app/(marketing)/page.tsx` — main redesign target
- `src/components/marketing/navbar.tsx` — navbar polish (ThemeToggle already added in Step 0)
- `src/components/marketing/footer.tsx` — footer polish

**Verification:** Landing page at `http://127.0.0.1:3000` looks production-ready in both light and dark modes; all CTAs work; Clerk modal opens on "Get started"

---

## Phase 2: Application Feature Implementation

**Goal:** Build all ResuMatchAI features — credits, resume upload, JD matching, history, settings.

### Step 1: Environment Variables

Add to `.env.local`:
```
N8N_API_KEY=<your_n8n_header_auth_value>
N8N_MAIN_WEBHOOK_ID=279f5964-5445-4b94-bae3-9a6d29f0dddb
N8N_ANALYTICS_WEBHOOK_ID=85e48153-e99d-40cc-9663-a7c0fd845c44
N8N_CREDITS_WEBHOOK_ID=1543b332-7b5f-4338-a390-74767805c396
N8N_DATA_WEBHOOK_ID=26dee7a9-19a0-4f65-af48-506384f50370
N8N_DELETE_WEBHOOK_ID=2df21026-2a38-4b57-9399-cc9fc848388f
```

### Step 2: Install shadcn/ui Components
```bash
npx shadcn@latest add progress table tabs textarea input dialog sonner tooltip skeleton
```

### Step 3: Type Definitions

Create `src/types/n8n.ts` with all request/response types (see Types section below).

### Step 4: Update n8n Client (`src/lib/n8n.ts`)

Two changes:
1. Add `"x-api-key": N8N_API_KEY` header to existing `callN8nWebhook()`
2. Add new `callN8nWebhookMultipart(webhookId, formData)` for file uploads (do NOT set Content-Type — let fetch auto-set multipart boundary)

### Step 5: n8n Category Helper Libraries (server-only)

Five thin wrapper files that add `event_type` and call the core functions:

- `src/lib/n8n-main.ts` → `processResume()`, `scrapeJd()`, `runResumeMatch()`
- `src/lib/n8n-analytics.ts` → `getUserAnalytics()`
- `src/lib/n8n-credits.ts` → `signupCredits()`, `getRemainingCredits()`, `getCreditHistory()`
- `src/lib/n8n-data.ts` → `getResumes()`, `getJds()`, `getJobMatchSummary()`
- `src/lib/n8n-delete.ts` → `deleteResume()`, `deleteJd()`, `deleteJobMatchSummary()`

### Step 6: Clerk Webhook Update

`src/app/api/webhooks/clerk/route.ts` — implement `user.created` event:
```typescript
case "user.created":
  await signupCredits(event.data.id); // gives new user 5 free credits
  break;
```

### Step 7: API Routes (12 total, server-side n8n proxy)

All routes: call `getAuth(req)` → return 401 if no `userId` → forward to n8n helpers.

```
POST   /api/resume/upload         → process_resume (multipart)
GET    /api/resume/list           → get_resume
DELETE /api/resume/[id]           → delete_resume
POST   /api/jd/submit             → scrape_jd (URL)
GET    /api/jd/list               → get_jds
DELETE /api/jd/[id]               → delete_jd
POST   /api/match/run             → resume_match
GET    /api/match/history         → get_job_match_summary
DELETE /api/match/[id]            → delete_job_match_summary
GET    /api/analytics             → user_analytics
GET    /api/credits/balance       → get_remaining_credit
GET    /api/credits/history       → credit_history
```

Build order: credits → analytics → resume list/delete → JD → match history/delete → match run → resume upload

### Step 8: Shared Dashboard Components (Server Components)

- `src/components/dashboard/credit-badge.tsx` — Fetches balance, renders as pill (`X credits`)
- `src/components/dashboard/stats-cards.tsx` — 3 stat cards (analyses run, avg score, last analysis)
- `src/components/dashboard/recent-matches.tsx` — Top-5 recent matches list

### Step 9: Dashboard Shell Updates

- `src/components/dashboard/top-nav.tsx` — Replace `breadcrumb` prop with `usePathname()` lookup:
  ```typescript
  const map = { "/dashboard": "Overview", "/dashboard/match": "Resume Match", ... }
  ```
- `src/components/dashboard/sidebar.tsx` — Add credit badge display at bottom of nav
- `src/app/(dashboard)/layout.tsx` — Add `<Toaster position="bottom-right" richColors />` + server-fetch credit balance for sidebar

### Step 10: Dashboard Overview (`/dashboard`)

Update existing page. Server Component with `Promise.all` for parallel fetches:
```typescript
const [analytics, credits] = await Promise.all([
  getUserAnalytics(userId),
  getRemainingCredits(userId),
]);
```
Wrap each in try/catch — zero-state fallback if n8n is unavailable.

### Step 11: Resume Match Page (`/dashboard/match`)

New page. Server Component pre-fetches existing resume list. Passes to `<MatchStepper>` (Client Component).

**3-step wizard:**
- **Step 1 — Choose Resume:** Grid of resume cards (select existing) + "Upload new" inline upload
- **Step 2 — Job Description:** URL input (tab shell ready for "Paste Text" tab when n8n adds support)
- **Step 3 — Results:** Animated score ring (0–100), matched/missing keywords, recommendations, gap analysis

**Client state:** `currentStep`, `selectedResumeId`, `submittedJdId`, `matchResult`, `isLoading`

**New components:**
```
src/components/dashboard/match/match-stepper.tsx     # Wizard shell (client)
src/components/dashboard/match/resume-picker.tsx     # Resume selection cards (client)
src/components/dashboard/match/resume-upload.tsx     # Drag-and-drop upload (client)
src/components/dashboard/match/jd-input.tsx          # URL input with tab shell (client)
src/components/dashboard/match/match-results.tsx     # Results display (client)
src/components/dashboard/match/score-ring.tsx        # Animated SVG circle (client)
```

### Step 12: History Page (`/dashboard/history`)

Server Component fetches all match summaries. `<HistoryTable>` (Client Component) handles client-side sort/filter. "View" button opens `<MatchDetailDialog>` with the full result as prop (no extra fetch).

```
src/components/dashboard/history/history-table.tsx         # Sortable table (client)
src/components/dashboard/history/match-detail-dialog.tsx   # Detail modal (client)
```

### Step 13: Settings Page (`/dashboard/settings`)

Three `<Tabs>` sections:
- **Profile** — Embed Clerk `<UserProfile>` component
- **Credits** — Balance display + `<CreditsSection>` (transaction history)
- **Account** — Danger zone (placeholder)

```
src/components/dashboard/settings/credits-section.tsx   # Balance + history (client)
```

### Step 14: Loading Skeletons

Add `loading.tsx` for all 4 dashboard pages using shadcn `<Skeleton>` components.

### Step 15: Toast Notifications

Use `sonner` `toast()` in all client components:
- Upload success → `toast.success("Resume uploaded")`
- Match complete → `toast.success("Analysis complete")`
- Delete → `toast.success("Deleted successfully")`
- Errors → `toast.error("Something went wrong. Please try again.")`

---

## Server vs Client Component Map

| File | SC/CC | Reason |
|---|---|---|
| `dashboard/page.tsx` | **Server** | Parallel data fetching |
| `stats-cards.tsx` | **Server** | Pure display |
| `credit-badge.tsx` | **Server** | Fetched in layout |
| `recent-matches.tsx` | **Server** | Pure display |
| `match/page.tsx` | **Server** | Pre-fetches resume list |
| `match/match-stepper.tsx` | **Client** | Wizard state |
| `match/resume-upload.tsx` | **Client** | File drag/drop events |
| `match/jd-input.tsx` | **Client** | Controlled input |
| `match/match-results.tsx` | **Client** | Animated display |
| `match/score-ring.tsx` | **Client** | SVG animation |
| `history/page.tsx` | **Server** | Pre-fetches all matches |
| `history/history-table.tsx` | **Client** | Sort/filter state |
| `history/match-detail-dialog.tsx` | **Client** | Dialog state |
| `settings/page.tsx` | **Server** | Pre-fetches credits |
| `settings/credits-section.tsx` | **Client** | Tab interactions |
| `sidebar.tsx` | **Client** | Already CC (usePathname) |
| `top-nav.tsx` | **Client** | Already CC (usePathname) |

---

## Key Types (`src/types/n8n.ts`)

```typescript
// Main Workflow
export type ProcessResumeResponse = { file_id: string; file_name: string };
export type ScrapeJdResponse = { url_id: string; jd_url?: string };
export type ResumeMatchResponse = {
  match_score: number;           // 0–100
  summary: string;
  matched_keywords: string[];
  missing_keywords: string[];
  recommendations: string[];
  gap_analysis: string;
  strengths: string[];
  // NOTE: Verify exact field names against live n8n output before building match-results.tsx
};

// Analytics
export type UserAnalyticsResponse = {
  total_resume_processed: number;
  total_jds_processed: number;
  total_job_match_summary_processed: number;
};

// Credits
export type CreditBalanceResponse = { current_balance: number };
export type CreditTransaction = {
  transaction_type: string;
  credits_delta: number;
  description: string;
  created_at: string;
};
export type CreditHistoryResponse = CreditTransaction[];

// Data
export type ResumeRecord = {
  file_id: string;
  file_name: string;
  file_size: number;
  file_base64: string;
};
export type JdRecord = {
  url_id: string;
  jd_url: string;
  is_jd: boolean;
  jd_object: Record<string, unknown>;
};
export type JobMatchSummary = {
  file_id: string; url_id: string; user_id: string;
  match_score: number; summary: string;
  matched_keywords: string[]; missing_keywords: string[];
  recommendations: string[]; gap_analysis: string; strengths: string[];
  created_at: string; file_name?: string; jd_url?: string;
};

// Delete
export type DeleteResponse = { success: boolean; message?: string };
```

---

## End-to-End Verification

1. Sign up → Clerk fires `user.created` webhook → user gets 5 free credits in n8n
2. Dashboard overview shows real stats (zeroes for new user = correct)
3. Upload a PDF resume → `file_id` returned from n8n
4. Submit job URL → n8n scrapes it, `url_id` returned
5. Run match → animated score ring + keywords + recommendations displayed
6. History page shows the completed match with correct score
7. Settings → Credits tab shows 4 credits remaining (1 used)
8. Delete a match from history → row removed from table
9. `npm run build` passes with no TypeScript errors

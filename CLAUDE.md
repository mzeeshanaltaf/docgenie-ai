# CLAUDE.md

## Overview

Next.js 16 (App Router) SaaS. The frontend only handles routing, auth, and UI — **n8n webhooks are the entire backend** (data storage, AI processing, credits). Auth is **Better Auth** (email/password + Google OAuth, Postgres-backed). Production runs on self-hosted **Coolify** (Hostinger VPS), auto-deployed from `main` via GitHub Actions.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript (strict)
- Tailwind v4 (CSS-first, no config file, OKLCH), shadcn/ui, CVA
- Better Auth (`better-auth`) — Postgres adapter, `document_genie` schema
- next-themes (`attribute="class"`), sonner (bottom-right, richColors), lucide-react

## Structure

```
src/
├── app/
│   ├── (marketing)/     # public; each page renders <Navbar/> + <Footer/> itself
│   │   ├── page.tsx      # landing (anchor sections #features, #pricing, …)
│   │   ├── sign-in, sign-up, contact, about, privacy, terms
│   ├── (dashboard)/dashboard/   # protected; layout wraps DashboardDataProvider
│   ├── api/             # proxy routes to n8n; api/auth/[...all] = Better Auth
│   └── layout.tsx       # ThemeProvider + Umami/Vercel analytics (no auth provider)
├── components/ (dashboard, marketing, contact, auth, ui, user-menu.tsx)
├── contexts/dashboard-data.tsx   # DashboardDataProvider (single source of truth)
├── lib/  (auth.ts, auth-client.ts, auth-session.ts, n8n*.ts, rate-limit.ts, utils.ts)
└── types/n8n.ts
```

## Auth (Better Auth)

- Server `src/lib/auth.ts`: pg `Pool` pinned to `document_genie` via `search_path`; email/password (no verification) + Google. **Signup credits** granted in `databaseHooks.user.create.after` (fires for both email and Google signups) → `signupCredits(user.id)`.
- Client `src/lib/auth-client.ts` exposes `signIn`/`signUp`/`signOut`/`useSession`.
- `src/middleware.ts` guards `/dashboard(.*)` via session cookie → redirects to `/sign-in`.
- API routes resolve the user with `getUserId()` from `@/lib/auth-session` (never Clerk).

## n8n Backend (`src/lib/n8n.ts`)

- `callN8nWebhook<T>(id, payload)` (JSON), `callN8nWebhookStream(id, payload)` (chat), `callN8nWebhookMultipart<T>(id, formData)` (uploads — **never set Content-Type**).
- All POST to `N8N_WEBHOOK_BASE_URL/{id}` with `x-api-key`. Pass the user as `user_id` in the payload (= Better Auth `user.id`).
- Responses are often `[{…}]` → `Array.isArray(d) ? d[0] : d`. Coerce numbers `Number(v ?? 0)`. Filter arrays with type guards before use.
- **Streaming** = newline-delimited JSON: take `content` from `type:"item"` events on the AI Agent node; the `"Respond to Webhook"` node emits the final JSON (parse its `content`).

## API Route Pattern

```typescript
import { getUserId } from "@/lib/auth-session";
export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await n8nFn(userId)); }
  catch { return Response.json({ error: "Failed" }, { status: 500 }); }
}
```

## Dashboard Data

`DashboardDataProvider` fetches all user data once on mount and exposes `refreshAll()`. **Always call `refreshAll()` after any credit/data-changing action** (upload, delete, chat message) or the navbar, sidebar credit display, and overview go stale.

## Contact Form

`/contact` posts to `/api/contact`: honeypot field `hp_field` (non-semantic name so autofill ignores it — drop the submission if filled) + Upstash per-IP rate limit (`src/lib/rate-limit.ts`, fails open if unset). Progressive enhancement (native POST + fetch, 303 redirect for no-JS).

## Deployment (Coolify)

- Coolify app on the Hostinger VPS, built from the `Dockerfile` (`output: "standalone"`); container **health check needs `curl` in the image**, port 3000.
- Push to `main` → `.github/workflows/deploy.yml` triggers a Coolify deploy (repo secrets `COOLIFY_API_TOKEN`, `COOLIFY_APP_UUID`). No Coolify git webhook.
- In Coolify, all `NEXT_PUBLIC_*` and `DATABASE_URL` must be **build-time** env.
- Umami analytics: `next/script` in root layout, gated on `NEXT_PUBLIC_UMAMI_*`.

## Styling

Emerald accent: `bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400`. Active nav: `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`. Focus: `focus-visible:ring-emerald-500/50`. Dark mode via OKLCH vars in `globals.css`. Icons from lucide-react.

## Pitfalls

- Multipart: never set `Content-Type` manually (fetch sets the boundary).
- Anchor links from non-home pages must be `/#features`, not `#features`.
- Chat session IDs are client-side `crypto.randomUUID()`; n8n creates the record on the first message.
- Client-only state (random IDs, browser APIs) causes hydration mismatch → wrap the top client component in `next/dynamic` with `{ ssr: false }`.
- react-pdf/pdfjs need the `canvas` alias for **both** turbopack and webpack in `next.config.ts` (+ root `canvas-stub.js`).

## Commands

```bash
npm run dev        # localhost:3000
npm run build      # production build (standalone output)
npx tsc --noEmit   # type-check only
```

## Environment Variables

- **Better Auth:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL` (tables in `document_genie`).
- **Rate limiting:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- **Analytics (build-time):** `NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.
- **n8n:** `N8N_WEBHOOK_BASE_URL`, `N8N_API_KEY`, `N8N_[FEATURE]_WEBHOOK_ID` (one per workflow).
- **Deploy:** `COOLIFY_API_TOKEN` (root, API/MCP), `COOLIFY_DEPLOY_TOKEN` (GitHub secret value).
- `NEXT_PUBLIC_*` are client-exposed at build time; everything else is server-only.

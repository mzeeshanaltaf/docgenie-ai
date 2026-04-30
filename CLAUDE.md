# CLAUDE.md

## Project Overview

This is a SaaS application built with Next.js (App Router) as the frontend, Clerk for authentication, and n8n workflows as the entire backend (via webhooks). All business logic, data storage, AI processing, and credit management lives in n8n — the Next.js app handles routing, auth, UI, and proxying requests to n8n.

## Tech Stack

- **Framework:** Next.js 16+ (App Router), React 19+, TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 (CSS-first config, no tailwind.config.ts), OKLCH color space
- **UI Components:** shadcn/ui (Slate theme + accent color), CVA for variants
- **Auth:** Clerk (`@clerk/nextjs`) — middleware-protected routes, `auth()` in API routes
- **Backend:** n8n webhooks — JSON, streaming, and multipart endpoints
- **Dark Mode:** next-themes (system-aware + manual toggle, `attribute="class"`)
- **Toasts:** sonner (position: bottom-right, richColors)
- **Icons:** lucide-react

## Project Structure

```
src/
├── app/
│   ├── (marketing)/        # Public pages — own layout with Navbar + Footer
│   │   ├── page.tsx        # Landing page with anchor sections (#features, #pricing, etc.)
│   │   ├── about/
│   │   ├── privacy/
│   │   └── terms/
│   ├── (dashboard)/        # Protected pages — layout wraps with DashboardDataProvider
│   │   └── dashboard/
│   │       ├── page.tsx    # Overview
│   │       └── [feature]/  # Feature pages (documents, chat, settings, etc.)
│   ├── api/                # API routes (proxy to n8n webhooks)
│   │   ├── webhooks/clerk/ # Clerk webhook handler (signup credits, etc.)
│   │   └── [feature]/      # Feature-specific routes
│   └── layout.tsx          # Root layout: ClerkProvider + ThemeProvider
├── components/
│   ├── dashboard/          # Sidebar, top-nav, credit-display, feature components
│   ├── marketing/          # Navbar, footer, contact-dialog
│   └── ui/                 # shadcn/ui primitives (do not edit manually)
├── contexts/
│   └── dashboard-data.tsx  # DashboardDataProvider — single source of truth
├── lib/
│   ├── n8n.ts              # Core webhook client (3 functions — see below)
│   ├── n8n-*.ts            # Feature-specific n8n wrappers
│   └── utils.ts            # cn() helper (clsx + tailwind-merge)
└── types/
    └── n8n.ts              # TypeScript types for all n8n request/response shapes
```

## Architecture Patterns

### n8n Webhook Client (`src/lib/n8n.ts`)

Three functions — use the right one for each scenario:

| Function | Use Case | Content-Type |
|----------|----------|-------------|
| `callN8nWebhook<T>(webhookId, payload)` | Standard JSON request/response | `application/json` |
| `callN8nWebhookStream(webhookId, payload)` | Streaming responses (chat) | `application/json` |
| `callN8nWebhookMultipart<T>(webhookId, formData)` | File uploads | **Do NOT set** (auto) |

All functions: POST to `N8N_WEBHOOK_BASE_URL/{webhookId}` with `x-api-key` header.

### API Route Pattern

Every API route follows this structure:

```typescript
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await n8nFunction(userId);
    return Response.json(data);
  } catch {
    return Response.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
```

Error responses: `{ error: string }` with appropriate status codes (400, 401, 500).

### Dashboard Data Context

`DashboardDataProvider` wraps the entire dashboard layout. It:
- Fetches **all** user data in a single consolidated webhook call on mount
- Exposes `refreshAll()` — call this after ANY credit/data-changing action
- Uses AbortController for cleanup on unmount
- Provides: documents, chat sessions, credit/message balances, transaction history

**Critical:** After upload, delete, chat message, or any action that changes credits, always call `refreshAll()` so the navbar, sidebar, and overview page stay in sync.

### n8n Streaming Protocol

n8n streams newline-delimited JSON objects. Parse them like this:

```
{ "type": "begin", "metadata": { "nodeName": "AI Agent", ... } }
{ "type": "item", "content": "Hello", "metadata": { "nodeName": "AI Agent", ... } }
{ "type": "item", "content": " world", "metadata": { "nodeName": "AI Agent", ... } }
{ "type": "end", "metadata": { "nodeName": "AI Agent", ... } }
{ "type": "item", "content": "{\"output\":\"Hello world\"}", "metadata": { "nodeName": "Respond to Webhook", ... } }
```

- Extract `content` from `type: "item"` events where `nodeName` is the AI agent
- The `"Respond to Webhook"` node sends the final JSON output — parse its `content` as JSON
- Use the webhook output as the definitive response; fall back to accumulated streamed text

### Session Management

Chat session IDs are generated **client-side** via `crypto.randomUUID()`. The n8n backend creates the session record on the first message — no separate "create session" API needed.

### Multipart File Uploads

When uploading files via `callN8nWebhookMultipart`:
- **Never** set the `Content-Type` header manually — `fetch` auto-sets the multipart boundary
- Validate file type and size on both client and server
- Build a new `FormData`, append the file and `user_id`, then pass to the function

## Styling Conventions

- **Accent color:** Emerald — `bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400`
- **Active nav items:** `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
- **Muted backgrounds:** `bg-muted/30`, `bg-muted/50`
- **Dark mode:** OKLCH color variables in `globals.css` under `:root` and `.dark`
- **Focus rings:** `focus-visible:ring-emerald-500/50`
- **Icons:** Always from `lucide-react`, consistent sizing within a component

## Common Pitfalls

1. **Multipart Content-Type:** Never set it manually. Fetch handles the boundary.
2. **n8n array wrapping:** Responses are often `[{ ... }]`. Always: `Array.isArray(data) ? data[0] : data`
3. **String numbers from n8n:** Coerce with `Number(val ?? 0)` — don't assume numeric fields are numbers.
4. **Anchor links from non-home pages:** Footer/navbar links to landing sections must use `/#features` not `#features`, otherwise they resolve as `/current-page#features`.
5. **Scroll containers:** Radix `ScrollArea` can fail if the parent doesn't have `overflow-hidden` and proper flex height. Use native `overflow-y-auto` as a fallback.
6. **Stale dashboard data:** Always call `refreshAll()` after credit-consuming actions. The navbar, sidebar credit display, and overview page all read from the same context.
7. **Streaming is not raw text:** n8n streams newline-delimited JSON events. Must parse each line as JSON and extract `content` from `type: "item"` events.
8. **Bot protection:** Public-facing forms (contact, etc.) should have math captcha or similar protection.
9. **Type guards for n8n data:** Always filter arrays before use: `.filter((r): r is Type => !!r.required_field)`

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npx tsc --noEmit     # Type-check without emitting
```

## Environment Variables

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# n8n Webhooks
N8N_WEBHOOK_BASE_URL=https://your-n8n-instance.com/webhook
N8N_API_KEY=your_api_key
N8N_[FEATURE]_WEBHOOK_ID=uuid    # One per n8n workflow
```

Naming: `NEXT_PUBLIC_*` for client-exposed values. All others are server-only. Group by service. Webhook IDs follow `N8N_[FEATURE_NAME]_WEBHOOK_ID` pattern.

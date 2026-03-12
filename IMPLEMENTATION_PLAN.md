# DocGenie — Implementation Plan

## Context

The codebase was transformed from a **ResuMatchAI** SaaS boilerplate into **DocGenie** — an AI-powered document Q&A application. Users upload documents (PDF, DOCX, TXT, CSV) and chat with them in natural language. The backend is fully implemented in n8n workflows with 8 webhook endpoints. The frontend uses Next.js 16, React 19, Clerk auth, shadcn/ui, Tailwind v4, and next-themes (dark mode).

**Status:** ✅ Fully implemented and production-ready.

---

## n8n Webhook Contract

All webhooks: `POST {N8N_WEBHOOK_BASE_URL}/{uuid}` with header `x-api-key: {N8N_API_KEY}`

| Workflow | Env Var | Purpose |
|---|---|---|
| **Ingestion** | `N8N_INGESTION_WEBHOOK_ID` | Upload & process documents |
| **AI Assistant** | `N8N_AI_ASSISTANT_WEBHOOK_ID` | Chat with documents |
| **Title Generator** | `N8N_TITLE_GENERATOR_WEBHOOK_ID` | Auto-generate chat session titles |
| **Analytics** | `N8N_ANALYTICS_WEBHOOK_ID` | User analytics |
| **Credits** | `N8N_CREDITS_WEBHOOK_ID` | Credit & message balance management |
| **Data** | `N8N_DATA_WEBHOOK_ID` | Fetch documents & chat history |
| **Delete** | `N8N_DELETE_WEBHOOK_ID` | Delete documents |
| **Contact** | `N8N_CONTACT_FORM_WEBHOOK_ID` | Contact form submissions |

---

## Phase 1: Marketing Landing Page ✅

### 1.1 Global Branding
- [layout.tsx](src/app/layout.tsx) — Metadata updated to "DocGenie"
- [package.json](package.json) — Name set to `"docgenie"`
- [.env.example](.env.example) — Webhook env vars updated for DocGenie

### 1.2 Navbar & Footer
- [navbar.tsx](src/components/marketing/navbar.tsx) — "DocGenie" brand, `BookOpen` icon, Features/How it works/Pricing links
- [footer.tsx](src/components/marketing/footer.tsx) — DocGenie brand, "AI-powered document Q&A" tagline

### 1.3 Landing Page
- [page.tsx](src/app/(marketing)/page.tsx) — Full rewrite with:
  - Hero: "Your documents, answered." with animated chat mockup
  - Features: Smart Document Processing, AI-Powered Chat, Session Management
  - How it works: Upload → Chat → Get Answers
  - Pricing: Free (5 credits, 25 messages) + Pro (Coming Soon) + Enterprise
  - CTA: "Stop searching. Start asking."

### 1.4 Static Pages
- [about/page.tsx](src/app/(marketing)/about/page.tsx) — DocGenie mission
- [privacy/page.tsx](src/app/(marketing)/privacy/page.tsx) — Document handling policies
- [terms/page.tsx](src/app/(marketing)/terms/page.tsx) — Service terms

### 1.5 Contact Form API
- [contact/route.ts](src/app/api/contact/route.ts) — Uses `N8N_CONTACT_FORM_WEBHOOK_ID`

---

## Phase 2: Backend Implementation ✅

### 2.1 Types
- [n8n.ts](src/types/n8n.ts) — Full DocGenie type definitions:
  - `DocumentRecord`, `ChatMessage`, `ChatSession`
  - `UserAnalyticsResponse`, `CreditBalanceResponse`, `CreditTransaction`
  - `IngestionResponse`, `ChatResponse`, `TitleResponse`, `DeleteResponse`

### 2.2 N8N Integration Functions
- [n8n.ts](src/lib/n8n.ts) — Core `callN8nWebhook` + `callN8nWebhookMultipart`
- [n8n-documents.ts](src/lib/n8n-documents.ts) — `uploadDocument`, `chatWithDocument`, `generateTitle`
- [n8n-analytics.ts](src/lib/n8n-analytics.ts) — `getUserAnalytics` → `{ total_documents_processed, credit_balance, message_balance }`
- [n8n-credits.ts](src/lib/n8n-credits.ts) — `signupCredits`, `getRemainingCredits` → `{ credit_balance, message_balance }`
- [n8n-data.ts](src/lib/n8n-data.ts) — `getUserDocuments`, `getChatHistory`
- [n8n-delete.ts](src/lib/n8n-delete.ts) — `deleteDocuments(userId, fileIds[])`

### 2.3 API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/documents/upload` | POST | Multipart upload, validates type + 5MB limit |
| `/api/documents/list` | GET | Fetch user's documents |
| `/api/documents/delete` | DELETE | Delete documents by file IDs |
| `/api/chat/message` | POST | Send message, get AI response |
| `/api/chat/title` | POST | Generate session title |
| `/api/chat/history` | GET | Fetch all chat sessions |
| `/api/analytics` | GET | User statistics |
| `/api/credits/balance` | GET | Credit + message balance |
| `/api/credits/history` | GET | Transaction history |
| `/api/contact` | POST | Contact form submission |
| `/api/webhooks/clerk` | POST | Clerk user.created → signup credits |

### 2.4 Dashboard Context
- [dashboard-data.tsx](src/contexts/dashboard-data.tsx) — State: `analytics`, `documents`, `chatSessions`, `creditBalance`, `messageBalance`, `creditHistory`
  - Methods: `refreshDocuments()`, `refreshChatSessions()`, `refreshCredits()`, `refreshAll()`

### 2.5 Dashboard Navigation
- [sidebar.tsx](src/components/dashboard/sidebar.tsx) — Nav: Overview, Documents, Chat, Settings
- [top-nav.tsx](src/components/dashboard/top-nav.tsx) — Breadcrumb map, credit + message balance
- [credit-display.tsx](src/components/dashboard/credit-display.tsx) — Dual balance display

### 2.6 Dashboard Home
- [dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx) — 3 stat cards + recent chat sessions + empty state CTA

### 2.7 Documents Page
- [documents/page.tsx](src/app/(dashboard)/dashboard/documents/page.tsx)
- [document-upload.tsx](src/components/dashboard/documents/document-upload.tsx) — Drag-and-drop, type validation, 5MB limit
- [document-list.tsx](src/components/dashboard/documents/document-list.tsx) — File list with delete confirmation

### 2.8 Chat Page
- [chat/page.tsx](src/app/(dashboard)/dashboard/chat/page.tsx)
- [chat-sidebar.tsx](src/components/dashboard/chat/chat-sidebar.tsx) — Session list, "New Chat" button, UUID session IDs
- [chat-messages.tsx](src/components/dashboard/chat/chat-messages.tsx) — Scrollable message area, user/AI bubbles, typing indicator
- [chat-input.tsx](src/components/dashboard/chat/chat-input.tsx) — Textarea, Enter to send, optimistic UI, auto-title on first message

### 2.9 Settings Page
- [settings/page.tsx](src/app/(dashboard)/dashboard/settings/page.tsx)
- [credits-section.tsx](src/components/dashboard/settings/credits-section.tsx) — Credit + message balance cards + transaction history

### 2.10 Loading States
- [documents/loading.tsx](src/app/(dashboard)/dashboard/documents/loading.tsx)
- [chat/loading.tsx](src/app/(dashboard)/dashboard/chat/loading.tsx)

---

## Architecture Decisions

- **Session IDs:** Generated client-side via `crypto.randomUUID()`. N8N creates the session record on first message — no "create session" API needed.
- **File types:** PDF, DOCX, TXT, CSV — validated on both client and server.
- **File size limit:** 5MB enforced at API route level.
- **Credit model:** `credit_balance` (document uploads) + `message_balance` (chat messages) tracked separately.
- **Context caching:** `DashboardDataProvider` fetches all data once on mount; selective refresh after mutations.

---

## Server vs Client Component Map

| File | SC/CC | Reason |
|---|---|---|
| `dashboard/page.tsx` | **Server** | Static data display |
| `documents/page.tsx` | **Client** | Upload interactions |
| `chat/page.tsx` | **Client** | Real-time chat state |
| `settings/page.tsx` | **Server** | Static shell |
| `credits-section.tsx` | **Client** | Tab interactions |
| `document-upload.tsx` | **Client** | File drag/drop events |
| `document-list.tsx` | **Client** | Delete confirmations |
| `chat-sidebar.tsx` | **Client** | Session switching |
| `chat-messages.tsx` | **Client** | Scroll/animation state |
| `chat-input.tsx` | **Client** | Controlled textarea |
| `sidebar.tsx` | **Client** | `usePathname()` |
| `top-nav.tsx` | **Client** | `usePathname()` |

---

## Verification Checklist

1. `npm run build` — No TypeScript errors
2. Sign up via Clerk → redirected to `/dashboard` → signup credits issued
3. Dashboard shows 0 documents, credits from signup
4. Upload a PDF → appears in documents list, credit decremented
5. Start new chat → send message → AI responds → title auto-generated
6. Switch between chat sessions → messages persist
7. Delete document → removed from list
8. Settings → shows credit + message balance + transaction history
9. Contact form → submits successfully
10. Test all file types: PDF, DOCX, TXT, CSV
11. Test error states: file >5MB, insufficient credits, insufficient messages
12. Dark mode works across all pages
13. Mobile responsiveness (sidebar collapses, chat layout adjusts)

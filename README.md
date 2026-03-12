# DocGenie

An AI-powered SaaS application that lets users upload documents and chat with them using natural language. Upload PDFs, DOCX, TXT, or CSV files and get instant AI-powered answers — no more searching through pages of content.

## Features

### 📄 Document Processing
- Upload PDF, DOCX, TXT, and CSV files (up to 5MB each)
- Drag-and-drop file upload with instant processing
- Document library with file management and deletion
- 5 document credits on signup (free tier)

### 💬 AI-Powered Chat
- Natural language Q&A against your documents
- Multiple chat sessions with auto-generated titles
- Full chat history preserved across sessions
- 25 message credits on signup (free tier)

### 📊 Smart Dashboard
- Overview with document count, credit balance, and message balance
- Recent chat sessions with one-click navigation
- Real-time credit tracking after every action
- Transaction history for all credit usage

### ⚡ Credit System
- **Document credits** — consumed on each document upload
- **Message credits** — consumed on each chat message
- Free tier: 5 document credits + 25 message credits on signup
- Transaction history in Settings

## Tech Stack

- **Frontend:** Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS v4
- **UI Components:** shadcn/ui (Slate theme + Emerald accent)
- **Auth:** Clerk
- **Backend:** n8n webhooks (AI processing, data storage, credit management)
- **State Management:** React Context API (`DashboardDataProvider`)
- **Dark Mode:** next-themes (system-aware + manual toggle)

## Project Structure

```
src/
├── app/
│   ├── (marketing)/          # Public marketing pages
│   │   ├── page.tsx          # Landing page
│   │   ├── about/            # About page
│   │   ├── privacy/          # Privacy policy
│   │   └── terms/            # Terms of service
│   ├── (dashboard)/          # Protected dashboard pages
│   │   ├── dashboard/
│   │   │   ├── page.tsx      # Overview
│   │   │   ├── documents/    # Document management
│   │   │   ├── chat/         # AI chat interface
│   │   │   └── settings/     # User settings & credits
│   │   └── layout.tsx        # Dashboard shell with DashboardDataProvider
│   ├── api/
│   │   ├── documents/        # Upload, list, delete
│   │   ├── chat/             # Message, title, history
│   │   ├── analytics/        # User statistics
│   │   ├── credits/          # Balance & history
│   │   ├── contact/          # Contact form
│   │   └── webhooks/         # Clerk webhook handler
│   └── layout.tsx            # Root layout with Clerk & theme providers
├── components/
│   ├── dashboard/
│   │   ├── documents/        # Upload + list components
│   │   ├── chat/             # Sidebar, messages, input
│   │   ├── settings/         # Credits section
│   │   ├── sidebar.tsx
│   │   ├── top-nav.tsx
│   │   └── credit-display.tsx
│   ├── marketing/            # Landing page components
│   ├── ui/                   # shadcn/ui primitives
│   └── theme-provider.tsx    # next-themes wrapper
├── contexts/
│   └── dashboard-data.tsx    # DashboardDataProvider context
├── lib/
│   ├── n8n.ts                # n8n webhook client (JSON + multipart)
│   ├── n8n-documents.ts      # uploadDocument, chatWithDocument, generateTitle
│   ├── n8n-analytics.ts      # getUserAnalytics
│   ├── n8n-credits.ts        # signupCredits, getRemainingCredits, getCreditHistory
│   ├── n8n-data.ts           # getUserDocuments, getChatHistory
│   └── n8n-delete.ts         # deleteDocuments
├── types/
│   └── n8n.ts                # TypeScript types for all n8n responses
└── middleware.ts             # Clerk auth middleware
```

## Architecture

### Data Flow

```
User Action → API Route → n8n Webhook → Claude AI
    ↓
n8n processes & stores data
    ↓
API returns result
    ↓
UI updates via DashboardDataProvider context
```

### DashboardDataProvider Context

- **Fetches once** on dashboard mount: analytics, documents, chat sessions, credit balance & history
- **refreshDocuments()** — called after upload or delete
- **refreshChatSessions()** — called after new messages
- **refreshCredits()** — called after any credit-consuming action
- **refreshAll()** — full refresh after major actions

### Chat Session Design

Session IDs are generated client-side via `crypto.randomUUID()`. n8n creates the session record on the first message — no separate "create session" API call required.

## Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm
- Clerk account (free tier)
- n8n instance with 8 configured webhook workflows

### Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd docgenie
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Fill in your credentials:
   ```env
   # Clerk (get from https://dashboard.clerk.com)
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   CLERK_WEBHOOK_SECRET=whsec_...

   # n8n
   N8N_WEBHOOK_BASE_URL=https://your-n8n-instance.com/webhook
   N8N_API_KEY=your_n8n_api_key
   N8N_INGESTION_WEBHOOK_ID=...
   N8N_AI_ASSISTANT_WEBHOOK_ID=...
   N8N_TITLE_GENERATOR_WEBHOOK_ID=...
   N8N_ANALYTICS_WEBHOOK_ID=...
   N8N_CREDITS_WEBHOOK_ID=...
   N8N_DATA_WEBHOOK_ID=...
   N8N_DELETE_WEBHOOK_ID=...
   N8N_CONTACT_FORM_WEBHOOK_ID=...
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

   Access at `http://localhost:3000`

### Build

```bash
npm run build
npm start
```

## API Endpoints

### Document Management
- `POST /api/documents/upload` — Upload and process a document (multipart, max 5MB, PDF/DOCX/TXT/CSV)
- `GET /api/documents/list` — List all user's documents
- `DELETE /api/documents/delete` — Delete documents by file IDs

### Chat
- `POST /api/chat/message` — Send a message, receive AI response
- `POST /api/chat/title` — Generate a title for a chat session
- `GET /api/chat/history` — Get all chat sessions with messages

### Analytics & Credits
- `GET /api/analytics` — User statistics (documents processed, balances)
- `GET /api/credits/balance` — Current credit + message balance
- `GET /api/credits/history` — Transaction history

### Other
- `POST /api/contact` — Contact form submission
- `POST /api/webhooks/clerk` — Clerk user lifecycle events (issues signup credits)

## n8n Webhook Contract

All webhooks accept `POST` requests with:
- Header: `x-api-key: {N8N_API_KEY}`
- Body: JSON with optional `event_type` field for n8n switch nodes

| Webhook | Env Var | Purpose |
|---------|---------|---------|
| **Ingestion** | `N8N_INGESTION_WEBHOOK_ID` | Process uploaded documents |
| **AI Assistant** | `N8N_AI_ASSISTANT_WEBHOOK_ID` | Chat Q&A responses |
| **Title Generator** | `N8N_TITLE_GENERATOR_WEBHOOK_ID` | Auto-generate session titles |
| **Analytics** | `N8N_ANALYTICS_WEBHOOK_ID` | User usage statistics |
| **Credits** | `N8N_CREDITS_WEBHOOK_ID` | Credit & message balance management |
| **Data** | `N8N_DATA_WEBHOOK_ID` | Retrieve documents & chat history |
| **Delete** | `N8N_DELETE_WEBHOOK_ID` | Delete documents |
| **Contact** | `N8N_CONTACT_FORM_WEBHOOK_ID` | Contact form handler |

## Supported File Types

| Type | Extension | Notes |
|------|-----------|-------|
| PDF | `.pdf` | Most common; full text extraction |
| Word | `.docx` | Microsoft Word documents |
| Text | `.txt` | Plain text files |
| CSV | `.csv` | Spreadsheet data |

Maximum file size: **5MB per document**

## Styling & Theme

- **Color scheme:** Emerald green accent on slate base
- **Dark mode:** System-aware with manual toggle (next-themes)
- **Typography:** Display font for headings, system font for body
- **Components:** shadcn/ui with custom styling
- **Animations:** CSS transitions + Tailwind v4

## Troubleshooting

### Document upload fails
- Check file type is PDF, DOCX, TXT, or CSV
- Verify file is under 5MB
- Check `N8N_INGESTION_WEBHOOK_ID` is correct in `.env.local`
- Inspect Network tab for API error details

### Chat not responding
- Verify `N8N_AI_ASSISTANT_WEBHOOK_ID` is correct
- Check n8n instance is running and workflow is active
- Ensure message credits > 0

### Credits not updating
- Check `N8N_CREDITS_WEBHOOK_ID` is correct
- Review n8n workflow logs for errors
- Hard refresh browser (Ctrl+Shift+R)

### Dark mode not persisting
- Verify `suppressHydrationWarning` is on `<html>` in root layout
- Check `next-themes` provider wraps the app in layout.tsx

## Deployment

### Vercel (Recommended)

```bash
git push origin main
# Vercel auto-deploys on push to main
```

Add all environment variables in Vercel Dashboard → Settings → Environment Variables.

Configure Clerk webhook URL to point to your deployed domain:
```
https://your-domain.com/api/webhooks/clerk
```

### Self-hosted

```bash
npm run build
npm start
```

## License

This project is proprietary. All rights reserved.

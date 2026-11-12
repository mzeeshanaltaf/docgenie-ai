/**
 * Response types for the FastAPI backend, as seen by the browser through the
 * `/api/**` proxies (the proxies pass bodies through unchanged).
 *
 * Source of truth: backend/app/schemas/*.py and backend/docs/chat-stream.md.
 * UUIDs and timestamps arrive as strings (timestamps are ISO 8601 UTC).
 */

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Body of every non-2xx response from the backend (and of proxy-made errors). */
export type ApiErrorBody = {
  success: false;
  status: string; // e.g. INSUFFICIENT_CREDITS, NOT_FOUND, FILE_TOO_LARGE
  message: string;
  details?: unknown;
};

// ─── Documents ──────────────────────────────────────────────────────────────

export type DocumentStatus = "processing" | "ready" | "failed";

export type CsvColumn = { name: string; type: string; sample?: unknown };

export type CsvSchema = {
  columns: CsvColumn[];
  row_count?: number;
  delimiter?: string;
};

export type DocumentOut = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number; // bytes
  num_pages: number | null; // null for CSV
  status: DocumentStatus;
  /** Set when status === "failed": NO_TEXT_FOUND, PARSE_FAILED, OCR_FAILED, ... */
  error_code: string | null;
  ocr_used: boolean;
  csv_schema: CsvSchema | null;
  created_at: string;
};

export type DocumentListOut = { documents: DocumentOut[] };

// ─── Credits ────────────────────────────────────────────────────────────────

export type CreditTransaction = {
  transaction_id: string;
  unit_type: "document" | "message";
  transaction_type: "signup" | "usage" | "refund";
  amount_delta: number;
  reference_id: string | null;
  file_name_snapshot: string | null;
  description: string | null;
  created_at: string;
};

export type CreditHistoryOut = { transactions: CreditTransaction[] };

export type SignupCreditsOut = {
  granted: boolean;
  credit_balance: number;
  message_balance: number;
};

// ─── Dashboard ──────────────────────────────────────────────────────────────

export type DashboardOut = {
  balances: { documents: number; messages: number };
  counts: {
    documents: number;
    documents_ready: number;
    documents_processing: number;
    documents_failed: number;
    sessions: number;
    user_messages: number;
  };
  /** Titles only; `title` is null until the first turn has been titled. */
  recent_sessions: { id: string; title: string | null; updated_at: string }[];
  recent_documents: {
    id: string;
    file_name: string;
    status: DocumentStatus;
    error_code: string | null;
    created_at: string;
  }[];
  /** Credit ledger, newest first. */
  recent_activity: {
    kind: "signup" | "usage" | "refund";
    unit_type: "document" | "message";
    amount_delta: number;
    file_name: string | null;
    description: string | null;
    created_at: string;
  }[];
  usage: {
    documents_spent: number;
    messages_spent: number;
    /** 14 UTC days, oldest first, zero-filled, today last. `date` is YYYY-MM-DD. */
    daily: { date: string; documents: number; messages: number }[];
  };
};

// ─── Chat sessions and messages ─────────────────────────────────────────────

export type SessionOut = {
  id: string;
  title: string | null;
  /** null = the chat covers all documents. */
  document_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

export type SessionListOut = { sessions: SessionOut[] };

export type FeedbackRating = "like" | "dislike";

export type FeedbackOut = {
  message_id: string | null;
  rating: FeedbackRating;
  reason: string | null;
  comment: string | null;
};

export type FeedbackIn = {
  rating: FeedbackRating;
  reason?: string;
  comment?: string;
};

export type MessageStatus = "complete" | "incomplete" | "error" | "stopped";

/** One entry of `MessageOut.parts`: exactly what the stream showed, in order. */
export type MessagePart =
  | { type: "reasoning"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      args: Record<string, unknown>;
      status: "done" | "error";
      result_summary: string;
      duration_ms: number;
    }
  | { type: "text"; text: string }
  | ({ type: "citation" } & Citation)
  | { type: "error"; code: string; message: string };

export type MessageMetrics = {
  ttft_ms: number | null;
  total_ms: number;
  output_tokens: number;
  input_tokens: number;
  reasoning_tokens: number;
  tokens_per_s: number | null;
  steps: number;
  tool_calls: number;
  model: string;
  service_tier: string;
  flex_fallback: boolean;
};

export type MessageOut = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: MessagePart[] | null; // null for user messages
  metrics: MessageMetrics | null; // null for user messages
  status: MessageStatus;
  model: string | null;
  created_at: string;
  feedback: FeedbackOut | null;
};

export type MessageListOut = { messages: MessageOut[] };

// ─── Chat stream (SSE) ──────────────────────────────────────────────────────

export type Citation = {
  index: number; // the [n] used in the answer text
  document_id: string;
  file_name: string;
  page_start: number | null; // null for CSV
  page_end: number | null;
  snippet: string;
};

export type ChatStreamEvent =
  | {
      event: "message.start";
      data: {
        session_id: string;
        user_message_id: string;
        message_id: string; // the assistant message
        created_at: string;
      };
    }
  | { event: "reasoning.delta"; data: { text: string } }
  | {
      event: "tool.start";
      data: { id: string; name: string; args: Record<string, unknown> };
    }
  | {
      event: "tool.end";
      data: {
        id: string;
        name: string;
        ok: boolean;
        summary: string;
        duration_ms: number;
      };
    }
  | { event: "text.delta"; data: { text: string } }
  | { event: "citation"; data: Citation }
  | { event: "error"; data: { code: string; message: string } }
  | {
      event: "message.end";
      data: {
        message_id: string;
        status: "complete" | "incomplete" | "error";
        usage: {
          input_tokens: number;
          output_tokens: number;
          reasoning_tokens: number;
          cached_tokens: number;
        };
        metrics: MessageMetrics;
      };
    }
  | { event: "session.title"; data: { session_id: string; title: string } };

/** Body of `POST /api/chat`. */
export type ChatRequest = {
  session_id: string;
  message: string;
  document_ids?: string[] | null;
};

// ─── Account ────────────────────────────────────────────────────────────────

export type AccountDeletedOut = {
  deleted: { documents: number; sessions: number; storage_objects: number };
};

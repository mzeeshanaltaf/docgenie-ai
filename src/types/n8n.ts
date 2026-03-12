// ─── Documents ──────────────────────────────────────────────────────────────

export type DocumentRecord = {
  file_id: string;
  file_name: string;
  mime_type: string;
  file_size: string;
  file_base64: string;
};

// ─── Chat ───────────────────────────────────────────────────────────────────

export type ChatMessage = {
  user_message: string;
  ai_response: string;
  created_at: string;
  updated_at: string;
};

export type ChatSession = {
  session_id: string;
  chat_title: string;
  messages: ChatMessage[];
};

// ─── Analytics ──────────────────────────────────────────────────────────────

export type UserAnalyticsResponse = {
  total_documents_processed: number;
  credit_balance: number;
  message_balance: number;
};

// ─── Credits ────────────────────────────────────────────────────────────────

export type CreditBalanceResponse = {
  credit_balance: number;
  message_balance: number;
};

export type CreditTransaction = {
  transaction_id: string;
  user_id: string;
  unit_type: string;
  transaction_type: string;
  amount_delta: number;
  reference_file_id: string | null;
  file_name_snapshot: string | null;
  description: string;
  created_at: string;
};

export type CreditHistoryResponse = CreditTransaction[];

// ─── Ingestion ──────────────────────────────────────────────────────────────

export type IngestionResponse = {
  success: boolean;
  status: string;
  message: string;
  details?: Record<string, unknown>;
};

// ─── Chat Responses ─────────────────────────────────────────────────────────

export type ChatResponseItem = {
  output: string;
};

export type TitleResponseItem = {
  output: {
    title: string;
  };
};

// ─── Delete ─────────────────────────────────────────────────────────────────

export type DeleteResponse = {
  success: boolean;
  status: string;
  message: string;
};

// ─── Signup Credits ─────────────────────────────────────────────────────────

export type SignupCreditsResponse = {
  success: boolean;
  status: string;
  message: string;
};

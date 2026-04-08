import { callN8nWebhook } from "./n8n";
import type {
  DocumentRecord,
  ChatSession,
  ChatMessage,
  UserDashboardData,
  UserDashboardResponse,
} from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_DATA_WEBHOOK_ID!;

/**
 * Fetch all dashboard data in a single webhook call:
 * documents, chat sessions, account summary, and credit transactions.
 */
export async function getUserDashboardData(
  userId: string
): Promise<UserDashboardData> {
  const raw = await callN8nWebhook<
    UserDashboardResponse[] | UserDashboardResponse
  >(WEBHOOK_ID, {
    event_type: "get_user_data",
    user_id: userId,
  });

  // Response is wrapped in an array
  const item = Array.isArray(raw) ? raw[0] : raw;
  const dashboard = item?.user_dashboard;

  return {
    documents: Array.isArray(dashboard?.documents) ? dashboard.documents : [],
    chat_sessions: Array.isArray(dashboard?.chat_sessions)
      ? dashboard.chat_sessions
      : [],
    account_summary: {
      credit_balance: Number(dashboard?.account_summary?.credit_balance ?? 0),
      message_balance: Number(dashboard?.account_summary?.message_balance ?? 0),
      user_documents: Number(dashboard?.account_summary?.user_documents ?? 0),
    },
    credit_transactions: Array.isArray(dashboard?.credit_transactions)
      ? dashboard.credit_transactions
      : [],
  };
}

export async function getUserDocuments(
  userId: string
): Promise<DocumentRecord[]> {
  const data = await callN8nWebhook<
    DocumentRecord[] | Record<string, unknown>
  >(WEBHOOK_ID, {
    event_type: "get_user_documents",
    user_id: userId,
  });
  const arr = Array.isArray(data) ? data : [];
  return arr.filter((r): r is DocumentRecord => !!r.file_id);
}

export async function getSessionChatHistory(
  userId: string,
  sessionId: string
): Promise<ChatMessage[]> {
  const data = await callN8nWebhook<ChatMessage[] | Record<string, unknown>>(
    WEBHOOK_ID,
    {
      event_type: "get_session_chat_history",
      user_id: userId,
      session_id: sessionId,
    }
  );
  return Array.isArray(data) ? data : [];
}

export async function getChatHistory(
  userId: string
): Promise<ChatSession[]> {
  const data = await callN8nWebhook<
    ChatSession[] | Record<string, unknown>
  >(WEBHOOK_ID, {
    event_type: "get_user_chat_history",
    user_id: userId,
  });
  const arr = Array.isArray(data) ? data : [];
  return arr.filter((r): r is ChatSession => !!r.session_id);
}

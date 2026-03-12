import { callN8nWebhook } from "./n8n";
import type { DocumentRecord, ChatSession } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_DATA_WEBHOOK_ID!;

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

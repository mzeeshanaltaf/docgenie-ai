import { callN8nWebhook, callN8nWebhookMultipart, callN8nWebhookStream } from "./n8n";
import type {
  IngestionResponse,
  ChatResponseItem,
  TitleResponseItem,
} from "@/types/n8n";

const INGESTION_WEBHOOK_ID = process.env.N8N_INGESTION_WEBHOOK_ID!;
const AI_ASSISTANT_WEBHOOK_ID = process.env.N8N_AI_ASSISTANT_WEBHOOK_ID!;
const TITLE_GENERATOR_WEBHOOK_ID = process.env.N8N_TITLE_GENERATOR_WEBHOOK_ID!;

export function uploadDocument(
  userId: string,
  formData: FormData
): Promise<IngestionResponse> {
  formData.append("user_id", userId);
  return callN8nWebhookMultipart<IngestionResponse>(
    INGESTION_WEBHOOK_ID,
    formData
  );
}

export function chatWithDocument(
  userQuery: string,
  userId: string,
  sessionId: string
): Promise<ChatResponseItem[]> {
  return callN8nWebhook<ChatResponseItem[]>(AI_ASSISTANT_WEBHOOK_ID, {
    user_query: userQuery,
    user_id: userId,
    session_id: sessionId,
  });
}

export function chatWithDocumentStream(
  userQuery: string,
  userId: string,
  sessionId: string
): Promise<Response> {
  return callN8nWebhookStream(AI_ASSISTANT_WEBHOOK_ID, {
    user_query: userQuery,
    user_id: userId,
    session_id: sessionId,
  });
}

export function generateTitle(
  userQuery: string,
  userId: string,
  sessionId: string
): Promise<TitleResponseItem[]> {
  return callN8nWebhook<TitleResponseItem[]>(TITLE_GENERATOR_WEBHOOK_ID, {
    user_query: userQuery,
    user_id: userId,
    session_id: sessionId,
  });
}

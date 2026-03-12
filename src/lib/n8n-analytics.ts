import { callN8nWebhook } from "./n8n";
import type { UserAnalyticsResponse } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_ANALYTICS_WEBHOOK_ID!;

export async function getUserAnalytics(
  userId: string
): Promise<UserAnalyticsResponse> {
  const raw = await callN8nWebhook<
    UserAnalyticsResponse | UserAnalyticsResponse[]
  >(WEBHOOK_ID, {
    user_id: userId,
  });
  const data = Array.isArray(raw) ? raw[0] : raw;
  return {
    total_documents_processed: Number(data?.total_documents_processed ?? 0),
    credit_balance: Number(data?.credit_balance ?? 0),
    message_balance: Number(data?.message_balance ?? 0),
  };
}

import { callN8nWebhook } from "./n8n";
import type { UserAnalyticsResponse } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_ANALYTICS_WEBHOOK_ID!;

export async function getUserAnalytics(
  userId: string
): Promise<UserAnalyticsResponse> {
  const raw = await callN8nWebhook<
    UserAnalyticsResponse | UserAnalyticsResponse[]
  >(WEBHOOK_ID, {
    event_type: "user_analytics",
    user_id: userId,
  });
  const data = Array.isArray(raw) ? raw[0] : raw;
  return {
    total_resume_processed: Number(data?.total_resume_processed ?? 0),
    total_jds_processed: Number(data?.total_jds_processed ?? 0),
    total_job_match_summary_processed: Number(data?.total_job_match_summary_processed ?? 0),
  };
}

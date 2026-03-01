import { callN8nWebhook } from "./n8n";
import type { DeleteResponse } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_DELETE_WEBHOOK_ID!;

export function deleteResume(
  userId: string,
  fileId: string
): Promise<DeleteResponse> {
  return callN8nWebhook<DeleteResponse>(WEBHOOK_ID, {
    event_type: "delete_resume",
    user_id: userId,
    file_id: fileId,
  });
}

export function deleteJd(
  userId: string,
  urlId: string
): Promise<DeleteResponse> {
  return callN8nWebhook<DeleteResponse>(WEBHOOK_ID, {
    event_type: "delete_jd",
    user_id: userId,
    url_id: urlId,
  });
}

export function deleteJobMatchSummary(
  userId: string,
  fileId: string,
  urlId: string
): Promise<DeleteResponse> {
  return callN8nWebhook<DeleteResponse>(WEBHOOK_ID, {
    event_type: "delete_job_match_summary",
    user_id: userId,
    file_id: fileId,
    url_id: urlId,
  });
}

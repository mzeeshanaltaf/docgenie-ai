import { callN8nWebhook } from "./n8n";
import type { DeleteResponse } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_DELETE_WEBHOOK_ID!;

export function deleteDocuments(
  userId: string,
  fileIds: string[]
): Promise<DeleteResponse> {
  return callN8nWebhook<DeleteResponse>(WEBHOOK_ID, {
    user_id: userId,
    file_ids: fileIds,
  });
}

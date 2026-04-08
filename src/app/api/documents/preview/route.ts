import { auth } from "@clerk/nextjs/server";
import { callN8nWebhook } from "@/lib/n8n";
import type { DocumentRecord } from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_PREVIEW_DOCUMENTS_WEBHOOK_ID!;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await callN8nWebhook<DocumentRecord[]>(WEBHOOK_ID, {
      event_type: "get_user_documents",
      user_id: userId,
    });
    const arr = Array.isArray(data) ? data : [];
    return Response.json(arr.filter((r): r is DocumentRecord => !!r.file_id));
  } catch {
    return Response.json({ error: "Failed to fetch preview" }, { status: 500 });
  }
}

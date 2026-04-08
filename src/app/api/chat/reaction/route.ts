import { auth } from "@clerk/nextjs/server";
import { callN8nWebhook } from "@/lib/n8n";

const WEBHOOK_ID = process.env.N8N_ADD_REACTION_WEBHOOK_ID!;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { session_id, id, reaction } = await req.json();

  if (!session_id || id == null) {
    return Response.json(
      { error: "session_id and id are required" },
      { status: 400 }
    );
  }

  try {
    const data = await callN8nWebhook(WEBHOOK_ID, {
      event_type: "add_reaction",
      user_id: userId,
      session_id,
      id,
      reaction: reaction ?? null,
    });
    return Response.json(data);
  } catch {
    return Response.json({ error: "Failed to update reaction" }, { status: 500 });
  }
}

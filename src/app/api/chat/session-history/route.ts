import { auth } from "@clerk/nextjs/server";
import { getSessionChatHistory } from "@/lib/n8n-data";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    const data = await getSessionChatHistory(userId, sessionId);
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "Failed to fetch session history" },
      { status: 500 }
    );
  }
}

import { auth } from "@clerk/nextjs/server";
import { getChatHistory } from "@/lib/n8n-data";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await getChatHistory(userId);
  return Response.json(sessions);
}

import { auth } from "@clerk/nextjs/server";
import { getCreditHistory } from "@/lib/n8n-credits";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const history = await getCreditHistory(userId);
  return Response.json(history);
}

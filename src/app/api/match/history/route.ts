import { auth } from "@clerk/nextjs/server";
import { getJobMatchSummary } from "@/lib/n8n-data";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await getJobMatchSummary(userId);
  return Response.json(matches);
}

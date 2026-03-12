import { auth } from "@clerk/nextjs/server";
import { getUserDocuments } from "@/lib/n8n-data";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await getUserDocuments(userId);
  return Response.json(documents);
}

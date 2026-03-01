import { auth } from "@clerk/nextjs/server";
import { getJds } from "@/lib/n8n-data";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCandidate = req.nextUrl.searchParams.get("is_candidate") !== "false";
  const jds = await getJds(userId, isCandidate);
  return Response.json(jds);
}

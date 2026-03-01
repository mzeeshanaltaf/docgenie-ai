import { auth } from "@clerk/nextjs/server";
import { getResumes } from "@/lib/n8n-data";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCandidate = req.nextUrl.searchParams.get("is_candidate") !== "false";
  const resumes = await getResumes(userId, isCandidate);
  return Response.json(resumes);
}

import { auth } from "@clerk/nextjs/server";
import { scrapeJd } from "@/lib/n8n-main";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url, jd_text, is_candidate } = await req.json();
  if ((!url || typeof url !== "string") && (!jd_text || typeof jd_text !== "string")) {
    return Response.json({ error: "url or jd_text is required" }, { status: 400 });
  }

  const isCandidate = is_candidate !== false;
  const jdUrl = url && typeof url === "string" ? url : "";
  const result = await scrapeJd(userId, jdUrl, isCandidate, jd_text);
  return Response.json(result);
}

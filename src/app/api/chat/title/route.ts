import { auth } from "@clerk/nextjs/server";
import { generateTitle } from "@/lib/n8n-documents";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, session_id } = await req.json();

  if (!query || !session_id) {
    return Response.json(
      { error: "query and session_id are required" },
      { status: 400 }
    );
  }

  try {
    const result = await generateTitle(query, userId, session_id);
    return Response.json(result);
  } catch (err) {
    console.error("Title generation error:", err);
    return Response.json({ error: "Title generation failed" }, { status: 500 });
  }
}

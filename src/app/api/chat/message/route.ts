import { auth } from "@clerk/nextjs/server";
import { chatWithDocumentStream } from "@/lib/n8n-documents";

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
    const n8nRes = await chatWithDocumentStream(query, userId, session_id);

    // Pass the n8n stream directly to the client
    return new Response(n8nRes.body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Chat message error:", err);
    return Response.json({ error: "Chat failed" }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";
import { deleteDocuments } from "@/lib/n8n-delete";

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { file_ids } = await req.json();

  if (!Array.isArray(file_ids) || file_ids.length === 0) {
    return Response.json(
      { error: "file_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  try {
    const result = await deleteDocuments(userId, file_ids);
    return Response.json(result);
  } catch (err) {
    console.error("Document delete error:", err);
    return Response.json({ error: "Delete failed" }, { status: 500 });
  }
}

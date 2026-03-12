import { auth } from "@clerk/nextjs/server";
import { uploadDocument } from "@/lib/n8n-documents";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json(
      { error: "Unsupported file type. Allowed: PDF, DOCX, TXT, CSV" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: "File size exceeds 5MB limit" },
      { status: 400 }
    );
  }

  try {
    const uploadForm = new FormData();
    uploadForm.append("file", file);

    const result = await uploadDocument(userId, uploadForm);
    return Response.json(result);
  } catch (err) {
    console.error("Document upload error:", err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

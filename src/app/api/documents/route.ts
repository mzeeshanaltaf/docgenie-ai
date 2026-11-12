import { getUserId } from "@/lib/auth-session";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { errorResponse, forward, unauthorized } from "@/lib/backend";

// GET /api/documents -> GET /v1/documents
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return forward("/v1/documents", { userId });
}

// POST /api/documents -> POST /v1/documents (multipart, field name "file")
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  // Cheap early rejection so an oversized upload is not buffered here first.
  // The backend enforces the real limit; 1 MB of slack covers multipart overhead.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return errorResponse(413, "FILE_TOO_LARGE", "The file is too large.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(422, "VALIDATION_ERROR", "Expected a multipart file upload.");
  }

  // Never set Content-Type here: fetch derives it (with the boundary) from FormData.
  return forward("/v1/documents", {
    userId,
    method: "POST",
    body: form,
    signal: req.signal,
    timeoutMs: 120_000,
  });
}

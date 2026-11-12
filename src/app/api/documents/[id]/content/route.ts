import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/documents/{id}/content[?download=true] -> GET /v1/documents/{id}/content
// Streams the original file (inline, or as an attachment with ?download=true).
export async function GET(req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const download = new URL(req.url).searchParams.get("download") === "true";
  return forward(
    `/v1/documents/${encodeURIComponent(id)}/content${download ? "?download=true" : ""}`,
    { userId, stream: true, signal: req.signal }
  );
}

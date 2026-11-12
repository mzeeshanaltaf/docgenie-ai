import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

// GET /api/account/export -> GET /v1/account/export
// Streams the zip (documents, chats, feedback, credits, original files) with
// the backend's Content-Disposition, so a plain link or window.location download works.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return forward("/v1/account/export", {
    userId,
    stream: true,
    signal: req.signal,
  });
}

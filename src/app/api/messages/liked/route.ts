import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

// GET /api/messages/liked -> GET /v1/messages/liked (newest first, with question and chat)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return forward("/v1/messages/liked", { userId });
}

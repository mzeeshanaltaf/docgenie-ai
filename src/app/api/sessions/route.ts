import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

// GET /api/sessions -> GET /v1/sessions (most recently active first)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return forward("/v1/sessions", { userId });
}

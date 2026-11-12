import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

// GET /api/dashboard -> GET /v1/dashboard (balances, counts, recent items, usage)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return forward("/v1/dashboard", { userId });
}

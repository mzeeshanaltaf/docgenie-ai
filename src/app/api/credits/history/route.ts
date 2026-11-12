import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

// GET /api/credits/history[?limit=50&offset=0] -> GET /v1/credits/history
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  // Only pass on the two known query params.
  const incoming = new URL(req.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ["limit", "offset"]) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  const qs = query.size ? `?${query}` : "";
  return forward(`/v1/credits/history${qs}`, { userId });
}

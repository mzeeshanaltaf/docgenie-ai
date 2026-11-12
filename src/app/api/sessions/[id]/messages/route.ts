import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/sessions/{id}/messages -> GET /v1/sessions/{id}/messages (oldest first)
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  return forward(`/v1/sessions/${encodeURIComponent(id)}/messages`, { userId });
}

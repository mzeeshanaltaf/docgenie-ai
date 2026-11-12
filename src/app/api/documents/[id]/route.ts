import { getUserId } from "@/lib/auth-session";
import { forward, unauthorized } from "@/lib/backend";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/documents/{id} -> GET /v1/documents/{id} (polled while status is "processing")
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  return forward(`/v1/documents/${encodeURIComponent(id)}`, { userId });
}

// DELETE /api/documents/{id} -> DELETE /v1/documents/{id}
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  return forward(`/v1/documents/${encodeURIComponent(id)}`, {
    userId,
    method: "DELETE",
  });
}

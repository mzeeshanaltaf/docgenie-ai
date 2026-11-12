import { getUserId } from "@/lib/auth-session";
import {
  errorResponse,
  forward,
  jsonBodyOf,
  unauthorized,
} from "@/lib/backend";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/messages/{id}/feedback -> PUT /v1/messages/{id}/feedback
// Body: { rating: "like" | "dislike", reason?, comment? }; replaces earlier feedback.
export async function PUT(req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const payload = await jsonBodyOf(req);
  if (!payload) {
    return errorResponse(422, "VALIDATION_ERROR", "A JSON body is required.");
  }
  return forward(`/v1/messages/${encodeURIComponent(id)}/feedback`, {
    userId,
    method: "PUT",
    ...payload,
  });
}

// DELETE /api/messages/{id}/feedback -> DELETE /v1/messages/{id}/feedback (idempotent)
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  return forward(`/v1/messages/${encodeURIComponent(id)}/feedback`, {
    userId,
    method: "DELETE",
  });
}

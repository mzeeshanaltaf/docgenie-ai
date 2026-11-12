import { getUserId } from "@/lib/auth-session";
import {
  errorResponse,
  forward,
  jsonBodyOf,
  unauthorized,
} from "@/lib/backend";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/sessions/{id} -> PATCH /v1/sessions/{id}
// Body: { title?, document_ids? }; document_ids null or [] = all documents.
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const payload = await jsonBodyOf(req);
  if (!payload) {
    return errorResponse(422, "VALIDATION_ERROR", "A JSON body is required.");
  }
  return forward(`/v1/sessions/${encodeURIComponent(id)}`, {
    userId,
    method: "PATCH",
    ...payload,
  });
}

// DELETE /api/sessions/{id} -> DELETE /v1/sessions/{id} (messages and feedback cascade)
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  return forward(`/v1/sessions/${encodeURIComponent(id)}`, {
    userId,
    method: "DELETE",
  });
}

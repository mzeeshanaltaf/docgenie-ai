import { getUserId } from "@/lib/auth-session";
import {
  BackendUnavailableError,
  backendStream,
  errorResponse,
  jsonBodyOf,
  toClientResponse,
  unauthorized,
  unavailableResponse,
} from "@/lib/backend";

// Never cache or statically optimise a chat turn.
export const dynamic = "force-dynamic";

// POST /api/chat -> POST /v1/chat/stream
// Body: { session_id, message, document_ids? }. The SSE body is piped through
// unchanged (contract: backend/docs/chat-stream.md). Errors that happen before
// the stream starts (402, 404, 422) come back as plain JSON with their status.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const payload = await jsonBodyOf(req);
  if (!payload) {
    return errorResponse(422, "VALIDATION_ERROR", "A JSON body is required.");
  }

  let upstream: Response;
  try {
    // req.signal aborts when the browser disconnects; passing it on makes the
    // backend cancel the model run (and store the partial answer).
    upstream = await backendStream("/v1/chat/stream", {
      userId,
      method: "POST",
      ...payload,
      signal: req.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    if (err instanceof BackendUnavailableError) return unavailableResponse(err);
    throw err;
  }

  if (!upstream.ok) return toClientResponse(upstream);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops compression from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

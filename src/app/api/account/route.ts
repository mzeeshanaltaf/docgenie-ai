import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getUserId } from "@/lib/auth-session";
import { errorResponse, unauthorized } from "@/lib/backend";

// DELETE /api/account   body: { password? }
//
// Deletes the account. Better Auth verifies the password (or, for Google
// sign-ups with no password, that the session is fresh), then its
// `beforeDelete` hook (src/lib/auth.ts) calls DELETE /v1/account on the
// backend. Only if that succeeds are the Better Auth user, accounts and
// sessions removed, and the session cookie cleared (forwarded below).
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  let password: string | undefined;
  try {
    const body = (await req.json()) as { password?: unknown };
    if (typeof body.password === "string" && body.password) {
      password = body.password;
    }
  } catch {
    // No body: fall back to the session-freshness check.
  }

  const res = await auth.api.deleteUser({
    headers: await headers(),
    body: password ? { password } : {},
    asResponse: true,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    return errorResponse(
      res.status,
      err?.code ?? "ACCOUNT_DELETE_FAILED",
      err?.message ?? "Could not delete the account."
    );
  }

  // Relay Better Auth's Set-Cookie headers so the session cookie is cleared.
  const out = Response.json({ success: true });
  for (const cookie of res.headers.getSetCookie()) {
    out.headers.append("set-cookie", cookie);
  }
  return out;
}

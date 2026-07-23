import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Resolves the current user's id from the Better Auth session, or null if the
 * request is unauthenticated. Replaces Clerk's `const { userId } = await auth()`
 * across the API routes.
 */
export async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

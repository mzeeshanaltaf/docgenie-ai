import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic gate: redirect unauthenticated visitors away from /dashboard.
// This only checks for the presence of the session cookie (fast, edge-safe).
// Full session validation happens in the API routes / server components,
// which run on the Node runtime where the Postgres pool is available.
export function middleware(req: NextRequest) {
  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};

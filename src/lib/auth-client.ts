import { createAuthClient } from "better-auth/react";

// baseURL is omitted so the client targets the current origin — this works
// unchanged across localhost, the temp subdomain, and the production domain.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

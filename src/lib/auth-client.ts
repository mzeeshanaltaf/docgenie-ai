import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// baseURL is omitted so the client targets the current origin — this works
// unchanged across localhost, the temp subdomain, and the production domain.
// emailOTPClient adds authClient.emailOtp.{sendVerificationOtp, verifyEmail,
// requestPasswordReset, resetPassword}.
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;

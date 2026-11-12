import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { backendJson } from "./backend";
import { sendOtpEmail } from "./email";
import type { SignupCreditsOut } from "@/types/api";

// Single pooled connection to the external Postgres. The `search_path` startup
// option pins every connection to the `document_genie` schema, so Better Auth's
// tables (user, session, account, verification) live there — see .env.local.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=document_genie",
});

export const auth = betterAuth({
  appName: "DocGenie",
  database: pool,

  // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
  emailAndPassword: {
    enabled: true,
    // Sign-up creates the account but NOT a session — the user has to enter the
    // emailed OTP first. Existing accounts with emailVerified = false hit this
    // on their next sign-in and are walked through the same flow.
    requireEmailVerification: true,
  },

  emailVerification: {
    // An unverified sign-in attempt gets a fresh code, so the user always has
    // one waiting when we redirect them to /verify-email.
    sendOnSignIn: true,
    // Verifying the code issues the session, so the user lands straight on the
    // dashboard instead of being bounced back to sign in.
    autoSignInAfterVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  user: {
    deleteUser: {
      enabled: true,
      // Runs after Better Auth has checked the password (or session freshness)
      // and BEFORE it removes the user rows. The backend deletes all of the
      // user's app data and stored files first (idempotent, so a retry after a
      // storage failure finishes the cleanup). If it fails we throw, which
      // aborts the deletion and leaves the login intact for a retry.
      // Nothing may call the backend for this user afterwards: the dashboard
      // endpoint would grant fresh signup credits to a user it has never seen.
      beforeDelete: async (user) => {
        try {
          await backendJson("/v1/account", {
            userId: user.id,
            method: "DELETE",
            timeoutMs: 120_000,
          });
        } catch (err) {
          console.error("Failed to delete the user's data in the backend:", err);
          throw new APIError("SERVICE_UNAVAILABLE", {
            message:
              "We could not delete your data right now. Nothing was removed from your login; please try again.",
          });
        }
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Fires for BOTH email and first-time Google sign-ups — replaces the
        // old Clerk `user.created` webhook that provisioned signup credits.
        // Errors are swallowed so a failed credit grant never blocks signup;
        // the backend also grants lazily on first use, so a miss self-heals.
        after: async (user) => {
          try {
            await backendJson<SignupCreditsOut>(
              `/v1/users/${encodeURIComponent(user.id)}/signup-credits`,
              { method: "POST" }
            );
          } catch (err) {
            console.error("Failed to provision signup credits:", err);
          }
        },
      },
    },
  },

  plugins: [
    emailOTP({
      // Replaces Better Auth's link-based verification email with our OTP
      // sender, so sign-up and unverified sign-in both emit a code.
      overrideDefaultEmailVerification: true,
      // Closes the plugin's passwordless /sign-in/email-otp path, which would
      // otherwise create nameless, passwordless accounts for unknown emails.
      disableSignUp: true,
      otpLength: 6,
      expiresIn: 600, // 10 minutes — keep in sync with the email copy.
      allowedAttempts: 3,
      // Codes are hashed in the `verification` table rather than stored plain.
      storeOTP: "hashed",
      // The plugin's own limiter guards the send endpoints (and the Resend
      // spend). Don't reuse lib/rate-limit.ts here — its window and Redis
      // prefix are hardcoded to the contact form and would share one bucket.
      rateLimit: { window: 60, max: 3 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        // "sign-in" and "change-email" flows aren't exposed in the UI.
        if (type !== "email-verification" && type !== "forget-password") return;
        await sendOtpEmail(email, otp, type);
      },
    }),
  ],

  // CSRF/redirect whitelist: local dev and the production domain.
  trustedOrigins: [
    "http://localhost:3000",
    "https://docgenie.zeeshanai.cloud",
  ],
});

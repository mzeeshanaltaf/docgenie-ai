import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { signupCredits } from "./n8n-credits";
import { sendOtpEmail } from "./email";

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

  databaseHooks: {
    user: {
      create: {
        // Fires for BOTH email and first-time Google sign-ups — replaces the
        // old Clerk `user.created` webhook that provisioned signup credits.
        // Errors are swallowed so a failed credit grant never blocks signup.
        after: async (user) => {
          try {
            await signupCredits(user.id);
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

import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { signupCredits } from "./n8n-credits";

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
    // No email provider is configured yet, so verification is off. Sign-up
    // creates the account immediately. (Forgot-password requires an email
    // sender and is intentionally out of scope until one is added.)
    requireEmailVerification: false,
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

  // CSRF/redirect whitelist: local dev, the temporary Coolify subdomain used
  // during migration, and the production domain.
  trustedOrigins: [
    "http://localhost:3000",
    "https://docgenie-new.zeeshanai.cloud",
    "https://docgenie.zeeshanai.cloud",
  ],
});

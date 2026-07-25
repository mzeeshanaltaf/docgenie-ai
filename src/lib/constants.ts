/**
 * Client-safe shared constants. Nothing here may import server-only modules —
 * these values are rendered by client components.
 */

/**
 * The address auth codes are sent from. Shown on the verify-email and
 * forgot-password screens so users know what to look for in their spam folder.
 *
 * This is also the default `from` in lib/email.ts, so the two can't drift
 * unless RESEND_FROM_EMAIL overrides it — if you set that env var to a
 * different address, update this too.
 */
export const OTP_SENDER_EMAIL = "noreply@verification.zeeshanai.cloud";

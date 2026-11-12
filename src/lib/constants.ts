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

/**
 * Upload limits shown in the UI and used for a cheap early check. The backend
 * is the authority (MAX_UPLOAD_MB / MAX_PAGES in backend/.env); keep these in
 * step with its defaults.
 */
export const MAX_UPLOAD_MB = 20;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_UPLOAD_PAGES = 50;
export const MAX_CSV_ROWS = 10_000;

/**
 * A PDF whose text layer averages fewer characters than this per page is read
 * with OCR instead (backend OCR_MIN_CHARS_PER_PAGE).
 */
export const OCR_MIN_CHARS_PER_PAGE = 25;

/** What a new account starts with (backend signup grant). Shown on the auth pages. */
export const SIGNUP_DOCUMENT_CREDITS = 5;
export const SIGNUP_MESSAGE_CREDITS = 25;

import { Resend } from "resend";
import { OTP_SENDER_EMAIL } from "./constants";

/**
 * Transactional email via Resend.
 *
 * This is the one part of the backend that does NOT go through n8n — Better
 * Auth needs a synchronous sender for its OTP flows. Server-only: the Resend
 * API has no CORS support, so this module must never reach a client component.
 */

const resend = new Resend(process.env.RESEND_API_KEY);

// Must exactly match a verified Resend domain (verification.zeeshanai.cloud),
// otherwise Resend rejects the send with 403. Defaults to the address the auth
// screens tell users to look for, so the UI copy and the real sender agree.
const FROM = process.env.RESEND_FROM_EMAIL || `DocGenie <${OTP_SENDER_EMAIL}>`;

export type OtpEmailType = "email-verification" | "forget-password";

// Keep in sync with `emailOTP({ expiresIn })` in lib/auth.ts.
const OTP_EXPIRY_MINUTES = 10;

// The logo is the app's own /apple-icon route (180px PNG of the favicon mark).
// Mail clients can't fetch localhost, so dev sends point at production —
// otherwise every test email shows a broken image.
const PUBLIC_URL = process.env.BETTER_AUTH_URL?.startsWith("https://")
  ? process.env.BETTER_AUTH_URL.replace(/\/$/, "")
  : "https://docgenie.zeeshanai.cloud";

export async function sendOtpEmail(
  email: string,
  otp: string,
  type: OtpEmailType
) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY environment variable is not set.");
  }

  const { subject, html, text } = otpTemplate(otp, type);

  // No idempotency key: every send carries a freshly rotated code, so a stable
  // key would 409 on the second send and a user pressing "Resend" must really
  // receive a new email.
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [email],
    subject,
    html,
    text,
  });

  // The Resend SDK resolves rather than throwing — errors surface on `error`,
  // so a bare try/catch would swallow every API failure silently.
  if (error) {
    throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
  }

  return data;
}

const COPY: Record<
  OtpEmailType,
  { subject: string; heading: string; intro: string; outro: string }
> = {
  "email-verification": {
    subject: "Verify your DocGenie email",
    heading: "Verify your email",
    intro: "Enter this code to finish setting up your DocGenie account.",
    outro:
      "If you didn't create a DocGenie account, you can safely ignore this email.",
  },
  "forget-password": {
    subject: "Reset your DocGenie password",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password for your DocGenie account.",
    outro:
      "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
  },
};

function otpTemplate(otp: string, type: OtpEmailType) {
  const { subject, heading, intro, outro } = COPY[type];

  // Table layout + inline styles: email clients strip <style> blocks and have
  // no flexbox/grid support worth relying on.
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your DocGenie code is ${otp}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;line-height:0;">
                      <img src="${PUBLIC_URL}/apple-icon" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;border-radius:8px;" />
                    </td>
                    <td style="font-size:18px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">DocGenie</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${heading}</h1>
                <p style="margin:8px 0 0 0;font-size:14px;line-height:22px;color:#475569;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;">
                  <tr>
                    <td align="center" style="padding:20px 16px;">
                      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#0f172a;">${otp}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:12px 0 0 0;font-size:13px;color:#64748b;">This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;">
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px 0;" />
                <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;">${outro}</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">DocGenie — chat with your documents</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${heading}`,
    "",
    intro,
    "",
    `Code: ${otp}`,
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    outro,
    "",
    "DocGenie — chat with your documents",
  ].join("\n");

  return { subject, html, text };
}

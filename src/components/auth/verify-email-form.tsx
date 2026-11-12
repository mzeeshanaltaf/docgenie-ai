"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { OtpField } from "@/components/auth/otp-field";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { useCooldown } from "@/components/auth/use-cooldown";
import { Loader2 } from "lucide-react";
import { AuthHeading, authLinkClass } from "@/components/auth/auth-ui";

export function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(60);

  // A code is always sent by the server before we get here (sign-up, or the
  // EMAIL_NOT_VERIFIED sign-in path), so this screen never sends on mount.
  useEffect(() => {
    if (!email) router.replace("/sign-up");
  }, [email, router]);

  async function handleVerify(code: string) {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const { error } = await authClient.emailOtp.verifyEmail({
        email,
        otp: code,
      });
      if (error) {
        toast.error(error.message || "That code isn't valid. Please try again.");
        setOtp("");
        return;
      }
      // autoSignInAfterVerification issued the session, so go straight in.
      router.push(redirectTo);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) {
        toast.error(error.message || "Could not send a new code.");
        return;
      }
      cooldown.start();
      setOtp("");
      toast.success("A new code is on its way.");
    } catch {
      toast.error("Could not send a new code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (!email) return null;

  return (
    <div>
      <AuthHeading title="Check your email">
        We sent a 6-digit code to{" "}
        <span className="font-medium break-all text-foreground">{email}</span>. It expires in 10 minutes.
      </AuthHeading>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleVerify(otp);
        }}
        className="space-y-4"
      >
        <OtpField
          value={otp}
          onChange={setOtp}
          onComplete={handleVerify}
          disabled={verifying}
        />
        <Button
          type="submit"
          disabled={verifying || otp.length !== 6}
          className="w-full"
        >
          {verifying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Verify email"
          )}
        </Button>
      </form>

      <div className="mt-6 text-body-sm text-muted-foreground">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || cooldown.active || verifying}
          className={`${authLinkClass} disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline`}
        >
          {cooldown.active
            ? `Resend in ${cooldown.remaining}s`
            : resending
              ? "Sending…"
              : "Resend code"}
        </button>
      </div>

      <EmailDeliveryNote className="mt-4" />

      <p className="mt-4 text-body-sm text-muted-foreground">
        Wrong address?{" "}
        <Link
          href="/sign-up"
          className={authLinkClass}
        >
          Start over
        </Link>
      </p>
    </div>
  );
}

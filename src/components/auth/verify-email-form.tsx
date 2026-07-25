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
import { BookOpen, Loader2, MailCheck } from "lucide-react";

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
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10">
            <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-lg font-semibold tracking-tight">DocGenie</span>
        </Link>
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10">
          <MailCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">{email}</span>. It
          expires in 10 minutes.
        </p>
      </div>

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
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          {verifying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Verify email"
          )}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || cooldown.active || verifying}
          className="font-medium text-emerald-600 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline dark:text-emerald-400"
        >
          {cooldown.active
            ? `Resend in ${cooldown.remaining}s`
            : resending
              ? "Sending…"
              : "Resend code"}
        </button>
      </div>

      <EmailDeliveryNote className="mt-4" />

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Wrong address?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Start over
        </Link>
      </p>
    </div>
  );
}

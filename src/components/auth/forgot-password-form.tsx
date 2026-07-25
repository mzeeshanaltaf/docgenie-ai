"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpField } from "@/components/auth/otp-field";
import { EmailDeliveryNote } from "@/components/auth/email-delivery-note";
import { useCooldown } from "@/components/auth/use-cooldown";
import { BookOpen, KeyRound, Loader2 } from "lucide-react";

type Step = "request" | "reset";

export function ForgotPasswordForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(60);

  async function requestCode(): Promise<boolean> {
    // Better Auth returns success even for unknown addresses, so the UI must
    // stay neutral either way — no account enumeration.
    const { error } = await authClient.emailOtp.requestPasswordReset({ email });
    if (error) {
      toast.error(error.message || "Could not send a code. Please try again.");
      return false;
    }
    return true;
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!(await requestCode())) return;
      cooldown.start();
      setStep("reset");
      toast.success("If an account exists for that email, we sent a code.");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      if (!(await requestCode())) return;
      cooldown.start();
      setOtp("");
      toast.success("A new code is on its way.");
    } catch {
      toast.error("Could not send a new code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await authClient.emailOtp.resetPassword({
        email,
        otp,
        password,
      });
      if (error) {
        toast.error(
          error.message || "Could not reset your password. Please try again."
        );
        return;
      }
      // resetPassword does not create a session — send them through sign-in.
      toast.success("Password updated. Sign in with your new password.");
      router.push("/sign-in");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const isRequest = step === "request";

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
          <KeyRound className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isRequest ? "Forgot your password?" : "Choose a new password"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isRequest ? (
            "Enter your email and we'll send you a code to reset it."
          ) : (
            <>
              Enter the 6-digit code sent to{" "}
              <span className="font-medium text-foreground">{email}</span> and
              pick a new password.
            </>
          )}
        </p>
      </div>

      {isRequest ? (
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              autoComplete="email"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Send reset code"
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="otp" className="sr-only">
              Verification code
            </label>
            <OtpField value={otp} onChange={setOtp} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-password" className="text-sm font-medium">
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm new password
            </label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Reset password"
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || cooldown.active || loading}
              className="font-medium text-emerald-600 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline dark:text-emerald-400"
            >
              {cooldown.active
                ? `Resend in ${cooldown.remaining}s`
                : resending
                  ? "Sending…"
                  : "Resend code"}
            </button>
          </div>

          <EmailDeliveryNote />
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

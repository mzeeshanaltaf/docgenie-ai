import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Enter the code we emailed you to activate your DocGenie account.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </main>
  );
}

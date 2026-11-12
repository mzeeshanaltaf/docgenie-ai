import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your DocGenie account.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <AuthShell lead="Your documents, chats and credit balance are where you left them.">
      <Suspense fallback={null}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </AuthShell>
  );
}

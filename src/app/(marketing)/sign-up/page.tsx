import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your DocGenie account and start chatting with your documents.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <AuthShell lead="Ask a question and see the page the answer came from.">
      <Suspense fallback={null}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </AuthShell>
  );
}

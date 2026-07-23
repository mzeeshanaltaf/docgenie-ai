import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your DocGenie account and start chatting with your documents.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <Suspense fallback={null}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your DocGenie account.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <Suspense fallback={null}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </main>
  );
}

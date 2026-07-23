"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

type Props = {
  signedOutLabel: string;
  signedInLabel?: string;
  className?: string;
  size?: "sm" | "lg" | "default";
  variant?: "default" | "outline";
  arrow?: boolean;
};

/**
 * Session-aware call-to-action. Signed-out visitors go to /sign-up; signed-in
 * users go to their dashboard. Replaces the Clerk <SignedIn>/<SignedOut> +
 * modal <SignInButton> blocks on the landing page.
 */
export function AuthCta({
  signedOutLabel,
  signedInLabel = "Go to Dashboard",
  className,
  size = "lg",
  variant = "default",
  arrow = false,
}: Props) {
  const { data: session } = useSession();
  const href = session ? "/dashboard" : "/sign-up";
  const label = session ? signedInLabel : signedOutLabel;

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link href={href}>
        {label}
        {arrow && <ArrowRight className="h-4 w-4" />}
      </Link>
    </Button>
  );
}

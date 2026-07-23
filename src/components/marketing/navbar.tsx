"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { BookOpen } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const anchor = (id: string) => (isHome ? `#${id}` : `/#${id}`);
  const { data: session, isPending } = useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10">
            <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="font-semibold tracking-tight">DocGenie</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden gap-7 text-sm md:flex">
          {(
            [
              ["Features", anchor("features")],
              ["How it works", anchor("how-it-works")],
              ["Pricing", anchor("pricing")],
              ["Contact", "/contact"],
            ] as const
          ).map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isPending ? null : session ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
              >
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

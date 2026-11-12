"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

/**
 * Anchor links always carry the leading slash (`/#pipeline`), so they work from
 * every page. On the home page the browser scrolls to the section; from any
 * other page it navigates home first.
 */
export const NAV_LINKS = [
  { label: "How it works", href: "/#pipeline" },
  { label: "Limits", href: "/#limits" },
  { label: "Under the hood", href: "/#stack" },
  { label: "Free preview", href: "/#preview" },
  { label: "Contact", href: "/contact" },
] as const;

const linkClass =
  "rounded-sm text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation (a route change or an in-page anchor) and on Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="border-b border-rule bg-background">
      <div className="page-container flex h-14 items-center justify-between gap-6">
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <Link key={label} href={href} className={linkClass}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isPending ? null : session ? (
            <>
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
          <Button
            ref={buttonRef}
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </div>

      {/* Mobile menu: an inline panel, not a modal. Grid rows animate the open
          state so no layout property is tweened. `inert` keeps the closed
          links out of the tab order. */}
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid border-rule transition-[grid-template-rows] duration-200 ease-out-quart lg:hidden",
          open ? "grid-rows-[1fr] border-t" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <nav aria-label="Menu" className="page-container pb-4">
            <ul className="divide-y divide-rule">
              {NAV_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center text-body text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            {isPending ? null : session ? (
              <div className="mt-2 sm:hidden">
                <Button asChild variant="outline" className="h-11 w-full">
                  <Link href="/dashboard" onClick={() => setOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:hidden">
                <Button asChild variant="outline" className="h-11">
                  <Link href="/sign-in" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild className="h-11">
                  <Link href="/sign-up" onClick={() => setOpen(false)}>
                    Get started
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

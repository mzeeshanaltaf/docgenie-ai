"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NAV_ITEMS, Sidebar } from "./sidebar";

/** `Dashboard / Documents`: the first crumb always links home, the last is the current page. */
function Breadcrumb() {
  const pathname = usePathname();
  const current =
    NAV_ITEMS.find(
      (i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(`${i.href}/`))
    )?.label ?? "Overview";

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-body-sm">
        <li>
          <Link
            href="/dashboard"
            className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Dashboard
          </Link>
        </li>
        <li aria-hidden className="text-muted-foreground">
          <ChevronRight className="size-3.5" />
        </li>
        <li aria-current="page" className="truncate font-medium">
          {current}
        </li>
      </ol>
    </nav>
  );
}

export function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2 md:hidden">
              <Menu aria-hidden />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Dashboard pages and credit balances.</SheetDescription>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

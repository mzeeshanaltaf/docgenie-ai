"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileText,
  LayoutDashboard,
  Target,
  ScanSearch,
  History,
  Settings,
  HelpCircle,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { CreditDisplay } from "./credit-display";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/match", label: "Job Fit", icon: Target },
  { href: "/dashboard/screen", label: "Resume Screener", icon: ScanSearch },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-background">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10">
          <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <span className="text-base font-semibold tracking-tight">ResuMatchAI</span>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === href
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Separator />

      {/* Bottom: credit badge + help */}
      <div className="px-3 py-4 space-y-2">
        <CreditDisplay />
        <Link
          href="#"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
          Help & Support
        </Link>
      </div>
    </aside>
  );
}

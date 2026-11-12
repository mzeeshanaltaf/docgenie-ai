"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, HelpCircle, LayoutDashboard, MessageSquare, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/wordmark";
import { CreditDisplay } from "./credit-display";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

const rowClass =
  "flex h-9 items-center gap-3 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * The app sidebar. It sits on the second neutral layer (`bg-sidebar`), one
 * step cooler than the content paper, and is separated from it by a hairline.
 * The active item is the accent's "selected" job: semibold ink on a wash with
 * a vermilion icon. No pill, no side stripe.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <Wordmark />
      </div>

      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    rowClass,
                    active
                      ? "bg-sidebar-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <Icon aria-hidden className={active ? "text-brand" : undefined} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border">
        <CreditDisplay className="px-4 py-4" />
        <div className="border-t border-sidebar-border px-2 py-2">
          <Link
            href="/contact"
            onClick={onNavigate}
            className={cn(
              rowClass,
              "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <HelpCircle aria-hidden />
            Help &amp; Support
          </Link>
        </div>
      </div>
    </aside>
  );
}

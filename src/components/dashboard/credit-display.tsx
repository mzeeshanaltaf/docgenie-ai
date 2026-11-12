"use client";

import { AlertTriangle } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { cn } from "@/lib/utils";

function Row({ label, value }: { label: string; value: number | null }) {
  const out = value === 0;
  return (
    <div className="flex items-baseline justify-between gap-3 text-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("figure flex items-center gap-1.5", out && "text-warning")}>
        {out ? (
          <>
            <AlertTriangle aria-hidden className="size-3.5" />
            <span className="sr-only">None left: </span>
          </>
        ) : null}
        {value ?? "–"}
      </dd>
    </div>
  );
}

/**
 * The credit balances. Shown once, in the sidebar (never also in the top bar).
 * A balance of zero gets a warning icon and the word "none" for screen readers,
 * so the state never rests on color alone.
 */
export function CreditDisplay({ className }: { className?: string }) {
  const { creditBalance, messageBalance } = useDashboardData();

  return (
    <div className={className} aria-label="Credits">
      <p className="ds-label">Credits</p>
      <dl className="mt-2 space-y-1">
        <Row label="Documents" value={creditBalance} />
        <Row label="Messages" value={messageBalance} />
      </dl>
    </div>
  );
}

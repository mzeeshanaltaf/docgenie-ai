"use client";

import { Zap, MessageSquare } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-data";

export function CreditDisplay() {
  const { creditBalance, messageBalance, analytics } = useDashboardData();

  // Use balance API data; fall back to analytics if balance is still loading (null)
  const credits = creditBalance ?? analytics?.credit_balance ?? null;
  const messages = messageBalance ?? analytics?.message_balance ?? null;

  if (credits === null && messages === null) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1">
        <Zap className="h-3 w-3 text-emerald-500" />
        <span className="text-xs font-medium tabular-nums">
          {credits ?? 0}
        </span>
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1">
        <MessageSquare className="h-3 w-3 text-blue-500" />
        <span className="text-xs font-medium tabular-nums">
          {messages ?? 0}
        </span>
      </div>
    </div>
  );
}

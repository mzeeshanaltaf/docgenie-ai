"use client";

import { Zap } from "lucide-react";
import { useDashboardData } from "@/contexts/dashboard-data";

export function CreditDisplay() {
  const { creditBalance } = useDashboardData();

  if (creditBalance === null) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1">
      <Zap className="h-3 w-3 text-emerald-500" />
      <span className="text-xs font-medium tabular-nums">
        {creditBalance}
      </span>
    </div>
  );
}

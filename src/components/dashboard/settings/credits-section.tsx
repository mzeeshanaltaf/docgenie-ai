"use client";

import { Zap, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "@/contexts/dashboard-data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CreditsSection() {
  const { creditBalance, messageBalance, creditHistory, loading } =
    useDashboardData();

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-20 w-48 rounded-lg" />
          <Skeleton className="h-20 w-48 rounded-lg" />
        </div>
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance cards */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
            <Zap className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Document Credits</p>
            <p className="text-3xl font-bold">{creditBalance ?? 0}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
            <MessageSquare className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Message Credits</p>
            <p className="text-3xl font-bold">{messageBalance ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Transaction History</h3>
        {!creditHistory || creditHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No transactions yet.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {creditHistory.map((tx, i) => (
              <div
                key={tx.transaction_id ?? i}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {tx.description || tx.transaction_type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tx.unit_type && (
                      <span className="mr-2 capitalize">{tx.unit_type}</span>
                    )}
                    {formatDate(tx.created_at)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    tx.amount_delta >= 0
                      ? "border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                      : "border-red-300 dark:border-red-800 text-red-700 dark:text-red-400"
                  }
                >
                  {tx.amount_delta >= 0 ? "+" : ""}
                  {tx.amount_delta}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

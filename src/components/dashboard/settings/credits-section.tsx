"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingRow } from "@/components/app/setting-row";
import { Tag } from "@/components/app/tag";
import { ledgerLabel } from "@/lib/credits";
import { formatDateTime, formatDelta } from "@/lib/format";
import type { CreditHistoryOut, CreditTransaction } from "@/types/api";

export function CreditsSection() {
  const { creditBalance, messageBalance, loading } = useDashboardData();

  // The ledger is fetched here, not held in the dashboard context: it is only
  // needed on this tab. Re-fetched when the balances change (a new ledger row).
  const [history, setHistory] = useState<CreditTransaction[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/credits/history", { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CreditHistoryOut>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        setHistory(data.transactions);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [creditBalance, messageBalance]);

  if (loading) {
    return (
      <div className="space-y-4 border-t border-rule py-6">
        <Skeleton className="h-10 w-72 max-w-full" />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <SettingRow
        title="Balance"
        description="One document credit per upload and one message credit per chat turn. A document that fails to process is refunded."
      >
        <dl className="flex gap-10">
          <div>
            <dt className="ds-label">Documents</dt>
            <dd className="figure mt-1 text-headline">{creditBalance ?? 0}</dd>
          </div>
          <div>
            <dt className="ds-label">Messages</dt>
            <dd className="figure mt-1 text-headline">{messageBalance ?? 0}</dd>
          </div>
        </dl>
      </SettingRow>

      <SettingRow title="History" description="Every change to your balance, newest first.">
        {failed && !history ? (
          <p role="alert" className="text-body-sm text-destructive">
            The history could not be loaded. Reload the page to try again.
          </p>
        ) : !history ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No changes yet. Uploads, chat messages and refunds will be listed here.
          </p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {history.map((tx) => (
              <li key={tx.transaction_id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium">{ledgerLabel(tx.transaction_type, tx.unit_type)}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {tx.file_name_snapshot ? `${tx.file_name_snapshot} · ` : ""}
                    <span className="figure">{formatDateTime(tx.created_at)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Tag>{tx.unit_type === "document" ? "Doc" : "Msg"}</Tag>
                  <span className="figure w-8 text-right text-body-sm font-medium">
                    <span className="sr-only">{tx.amount_delta >= 0 ? "Plus " : "Minus "}</span>
                    {formatDelta(tx.amount_delta)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingRow>
    </div>
  );
}

"use client";

import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeChatError, type ChatErrorInfo } from "@/lib/chat/errors";

/**
 * The error state for a failed answer. Says what happened and what happened to
 * the credit, and offers a retry only where retrying makes sense.
 */
export function ChatErrorNotice({
  error,
  onRetry,
}: {
  error: ChatErrorInfo | null;
  onRetry?: () => void;
}) {
  const view = describeChatError(error);
  return (
    <div role="alert" className="flex gap-3 border border-destructive/40 bg-card p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold text-foreground">{view.title}</p>
        <p className="text-body-sm text-muted-foreground">{view.detail}</p>
        {error?.code && (
          <p className="ds-label mt-1 normal-case">{error.code}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {view.retryable && onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RotateCw aria-hidden /> Try again
            </Button>
          )}
          {view.outOfCredits && (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/settings">View credits</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

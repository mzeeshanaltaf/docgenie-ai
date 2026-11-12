"use client";

import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  ActionBarPrimitive,
  AuiIf,
  useAuiState,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { readCustom } from "@/lib/chat/convert";
import type { MessageMetrics } from "@/types/api";
import { cn } from "@/lib/utils";
import { DislikePopover } from "./dislike-popover";

export function formatStamp(date: Date): string {
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/**
 * The figure row (DESIGN.md): legend label over a mono figure. Timing and token
 * counts for one answer. Presentational, so static data can drive it.
 */
export function MetricsRow({ metrics }: { metrics: MessageMetrics }) {
  const items: { label: string; value: string }[] = [];
  if (metrics.ttft_ms != null) items.push({ label: "First token", value: fmtMs(metrics.ttft_ms) });
  items.push({ label: "Total", value: fmtMs(metrics.total_ms) });
  if (metrics.tokens_per_s != null) {
    items.push({ label: "Tokens/s", value: metrics.tokens_per_s.toFixed(1) });
  }
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="ds-label">{it.label}</dt>
          <dd className="figure text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const actionClass =
  "text-muted-foreground hover:text-foreground data-[active=true]:text-brand";

/** Footer of a finished answer: time, copy / like / dislike and the metrics. */
export function MessageFooter() {
  const createdAt = useAuiState((s) => s.message.createdAt);
  const custom = useAuiState((s) => s.message.metadata.custom);
  const feedback = useAuiState((s) => s.message.metadata.submittedFeedback?.type);
  const { createdAt: serverTime, metrics } = readCustom(custom);
  const when = serverTime ? new Date(serverTime) : createdAt;

  return (
    <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex items-center gap-1">
        <time
          dateTime={when.toISOString()}
          className="figure mr-2 text-body-sm text-muted-foreground"
        >
          {formatStamp(when)}
        </time>
        <ActionBarPrimitive.Copy asChild>
          <Button type="button" variant="ghost" size="icon-sm" className={actionClass} aria-label="Copy answer">
            <AuiIf condition={(s) => s.message.isCopied}>
              <Check aria-hidden />
            </AuiIf>
            <AuiIf condition={(s) => !s.message.isCopied}>
              <Copy aria-hidden />
            </AuiIf>
          </Button>
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.FeedbackPositive asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-active={feedback === "positive"}
            aria-pressed={feedback === "positive"}
            className={actionClass}
            aria-label="Good answer"
          >
            <ThumbsUp className={cn(feedback === "positive" && "fill-current")} aria-hidden />
          </Button>
        </ActionBarPrimitive.FeedbackPositive>
        <DislikePopover>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-active={feedback === "negative"}
            aria-pressed={feedback === "negative"}
            className={actionClass}
            aria-label="Bad answer"
          >
            <ThumbsDown className={cn(feedback === "negative" && "fill-current")} aria-hidden />
          </Button>
        </DislikePopover>
      </div>
      {metrics && <MetricsRow metrics={metrics} />}
    </div>
  );
}

"use client";

import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  ActionBarPrimitive,
  AuiIf,
  useAuiState,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { readCustom } from "@/lib/chat/convert";
import { cn } from "@/lib/utils";
import { DislikePopover } from "./dislike-popover";
import { MetricsRow } from "./metrics-row";

const actionClass =
  "text-muted-foreground hover:text-foreground data-[active=true]:text-brand";

/**
 * Footer of a finished answer, one line: copy / like / dislike, then the
 * metrics, which only show while the answer is hovered or has keyboard focus.
 */
export function MessageFooter() {
  const custom = useAuiState((s) => s.message.metadata.custom);
  const feedback = useAuiState((s) => s.message.metadata.submittedFeedback?.type);
  const { metrics } = readCustom(custom);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="-ml-2 flex items-center gap-1">
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
      {metrics && (
        <MetricsRow
          metrics={metrics}
          variant="inline"
          // Keyboard focus only: a mouse click (e.g. on "Thought for") also focuses,
          // and that focus would keep the metrics up after the pointer leaves.
          className="opacity-0 transition-opacity duration-150 group-hover/answer:opacity-100 group-has-focus-visible/answer:opacity-100"
        />
      )}
    </div>
  );
}

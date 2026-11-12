"use client";

import { useState, type ReactNode } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DISLIKE_REASONS, stageDislikeReason, type DislikeReason } from "@/lib/chat/feedback";
import { cn } from "@/lib/utils";

/**
 * Opens next to the dislike button (an inline popover, not a modal): reason
 * chips and an optional comment. Submitting records a `negative` feedback on
 * the message; the feedback adapter saves it with the reason.
 */
export function DislikePopover({ children }: { children: ReactNode }) {
  const aui = useAui();
  const messageId = useAuiState((s) => s.message.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DislikeReason | null>(null);
  const [comment, setComment] = useState("");

  const submit = () => {
    stageDislikeReason(messageId, reason);
    aui.message().submitFeedback({
      type: "negative",
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
    setOpen(false);
    setReason(null);
    setComment("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent aria-label="What was wrong with this answer?">
        <p className="text-body-sm font-semibold text-foreground">What was wrong?</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Reason">
          {DISLIKE_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={reason === r.id}
              onClick={() => setReason(reason === r.id ? null : r.id)}
              className={cn(
                "min-h-8 rounded-sm border px-2.5 text-body-sm transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                reason === r.id
                  ? "border-brand bg-brand-subtle text-brand"
                  : "border-input text-foreground hover:bg-accent"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)"
          maxLength={1000}
          rows={3}
          className="mt-3 resize-none text-body-sm"
          aria-label="Comment"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit}>
            Send feedback
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

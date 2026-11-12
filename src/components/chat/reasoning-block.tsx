"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ReasoningMessagePartComponent } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

/** The bold heading the model puts on a reasoning summary, e.g. `**Checking the date**`. */
function headingOf(text: string): string | null {
  const m = text.match(/^\s*\*\*(.+?)\*\*/);
  return m ? m[1].trim() : null;
}

/** Summary text without the heading line, as plain paragraphs. */
function bodyOf(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

/**
 * Presentational reasoning block: open while the model is thinking, collapsed
 * once the answer starts, reopenable by hand. Props make it usable from static
 * data (the landing replay) as well as from the live message.
 */
export function ReasoningView({ text, running }: { text: string; running: boolean }) {
  const [open, setOpen] = useState(running);
  const wasRunning = useRef(running);

  // Collapse when the summary stops streaming (the answer has started).
  useEffect(() => {
    if (wasRunning.current && !running) setOpen(false);
    wasRunning.current = running;
  }, [running]);

  const heading = headingOf(text);

  return (
    <div className="border-y border-rule">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center gap-2 py-1.5 text-left text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")}
          aria-hidden
        />
        <span className="ds-label shrink-0">Reasoning</span>
        <span className={cn("truncate", running && "animate-pulse")}>
          {running ? (heading ?? "Thinking") : (heading ?? "")}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out-quart",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <p className="measure pb-3 pl-5 text-body-sm whitespace-pre-wrap text-muted-foreground">
            {bodyOf(text)}
          </p>
        </div>
      </div>
    </div>
  );
}

export const ReasoningPart: ReasoningMessagePartComponent = ({ text, status }) => {
  if (!text.trim()) return null;
  return <ReasoningView text={text} running={status.type === "running"} />;
};

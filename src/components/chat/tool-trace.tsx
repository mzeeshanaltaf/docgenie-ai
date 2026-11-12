"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Loader2 } from "lucide-react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import type { ToolTraceResult } from "@/lib/chat/convert";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  list_documents: "List documents",
  search_documents: "Search documents",
  get_document_text: "Read document",
  query_table: "Query table",
};

/** One short line of the arguments: the query, the SQL or the document id. */
export function describeArgs(name: string, args: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (name) {
    case "search_documents":
      return str(args.query);
    case "query_table":
      return str(args.sql) || str(args.query);
    case "get_document_text":
      return str(args.document_id);
    default: {
      const first = Object.values(args).map(str).find(Boolean);
      return first ?? "";
    }
  }
}

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/**
 * One row of the trace: name, a one-line argument, duration, and an expandable
 * result summary. Presentational, so the landing replay can render it from
 * static data.
 */
export function ToolTraceRow({
  name,
  args,
  result,
}: {
  name: string;
  args: Record<string, unknown>;
  /** Undefined while the call is still running. */
  result?: ToolTraceResult;
}) {
  const [open, setOpen] = useState(false);
  const running = result === undefined;
  const argLine = describeArgs(name, args);
  const label = TOOL_LABELS[name] ?? name;

  return (
    <div className="border-b border-rule">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={running}
        className="flex min-h-9 w-full items-center gap-2 py-1.5 text-left text-body-sm transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
            running && "opacity-30"
          )}
          aria-hidden
        />
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Running" />
        ) : result.ok ? (
          <Check className="size-3.5 shrink-0 text-success" aria-label="Done" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-label="Failed" />
        )}
        <span className="shrink-0 font-medium text-foreground">{label}</span>
        {argLine && (
          <span className="figure min-w-0 flex-1 truncate text-muted-foreground">{argLine}</span>
        )}
        {!argLine && <span className="flex-1" />}
        {result && (
          <span className="figure shrink-0 text-muted-foreground">{formatMs(result.duration_ms)}</span>
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out-quart",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <dl className="space-y-1 pb-3 pl-5 text-body-sm">
            {argLine && (
              <div>
                <dt className="ds-label">Input</dt>
                <dd className="figure break-words whitespace-pre-wrap text-foreground">{argLine}</dd>
              </div>
            )}
            {result && (
              <div>
                <dt className="ds-label">Result</dt>
                <dd className={cn("break-words", result.ok ? "text-foreground" : "text-destructive")}>
                  {result.summary}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

export const ToolCallPart: ToolCallMessagePartComponent = ({ toolName, args, result }) => {
  const r =
    result && typeof result === "object" && "summary" in (result as object)
      ? (result as ToolTraceResult)
      : undefined;
  return <ToolTraceRow name={toolName} args={args as Record<string, unknown>} result={r} />;
};

"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  FileText,
  Files,
  Lightbulb,
  Loader2,
  Search,
  Table2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The thinking block, presentational and free of assistant-ui so static data
 * can drive it (the landing replay) and the chat runtime stays out of the
 * landing bundle. The live chat wraps it in `thought-process.tsx`.
 */

/** One tool call's outcome. The stream sends a one-line summary, never raw output. */
export type ToolStepResult = { ok: boolean; summary: string; duration_ms: number };

export type ToolStep = {
  kind: "tool";
  key: string;
  name: string;
  args: Record<string, unknown>;
  /** Undefined while the call is still running. */
  result?: ToolStepResult;
};

export type ThoughtStep = {
  kind: "thought";
  key: string;
  heading: string | null;
  body: string;
  /** The section the model is still writing. */
  streaming: boolean;
};

export type Step = ToolStep | ThoughtStep;

const TOOLS: Record<string, { icon: LucideIcon; running: string; done: string }> = {
  search_documents: { icon: Search, running: "Searching documents", done: "Searched documents" },
  get_document_text: { icon: FileText, running: "Reading document", done: "Read document" },
  query_table: { icon: Table2, running: "Querying table", done: "Queried table" },
  list_documents: { icon: Files, running: "Listing documents", done: "Listed documents" },
};

/** One short line of a tool's arguments: the query, the SQL or the document id. */
function describeArgs(name: string, args: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (name) {
    case "search_documents":
      return str(args.query);
    case "query_table":
      return str(args.sql) || str(args.query);
    case "get_document_text":
      return str(args.document_id);
    default:
      return Object.values(args).map(str).find(Boolean) ?? "";
  }
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function formatSeconds(ms: number): string {
  return ms >= 10_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * A reasoning summary arrives as sections, each opening with a bold heading
 * (`**Planning the answer**`). Splits one reasoning part into those sections.
 */
export function thoughtSections(text: string): { heading: string | null; body: string }[] {
  return text
    .split(/\n{2,}(?=\s*\*\*)/)
    .map((section) => {
      const m = section.match(/^\s*\*\*(.+?)\*\*\s*/);
      const heading = m ? m[1].trim() : null;
      const body = (m ? section.slice(m[0].length) : section).replace(/\*\*/g, "").trim();
      return { heading, body };
    })
    .filter((s) => s.heading || s.body);
}

function StepIcon({ step, active }: { step: Step; active: boolean }) {
  const cls = "size-3.5";
  if (step.kind === "thought") return <Brain className={cls} aria-hidden />;
  if (!step.result) {
    return active ? (
      <Loader2 className={cn(cls, "animate-spin")} aria-label="Running" />
    ) : (
      <Wrench className={cls} aria-hidden />
    );
  }
  if (!step.result.ok) return <AlertTriangle className={cn(cls, "text-destructive")} aria-label="Failed" />;
  const Icon = TOOLS[step.name]?.icon ?? Wrench;
  return <Icon className={cls} aria-hidden />;
}

function StepRow({
  step,
  last,
  active,
  docName,
}: {
  step: Step;
  last: boolean;
  active: boolean;
  docName?: (id: string) => string | undefined;
}) {
  let title: string;
  let detail: string | null = null;
  let meta: string | null = null;

  if (step.kind === "thought") {
    title = step.heading ?? (step.streaming ? "Thinking" : "Thought");
    detail = step.body || null;
  } else {
    const labels = TOOLS[step.name];
    title = step.result ? (labels?.done ?? step.name) : (labels?.running ?? step.name);
    const arg = describeArgs(step.name, step.args);
    detail = (step.name === "get_document_text" && docName?.(arg)) || arg || null;
    if (step.result) meta = `${step.result.summary} · ${formatMs(step.result.duration_ms)}`;
  }

  return (
    <li className="relative flex gap-3 pb-3 last:pb-1">
      {/* the rail joining the step icons */}
      {!last && <span aria-hidden className="absolute top-6 bottom-0 left-[11px] w-px bg-rule" />}
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-rule bg-card text-muted-foreground">
        <StepIcon step={step} active={active} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-body-sm font-medium text-foreground">{title}</p>
        {detail && (
          <p
            className={cn(
              "measure mt-0.5 text-body-sm wrap-break-word whitespace-pre-wrap text-muted-foreground",
              step.kind === "tool" && "figure line-clamp-3"
            )}
          >
            {detail}
            {step.kind === "thought" && step.streaming && (
              <span aria-hidden className="ml-1 inline-block size-1.5 animate-pulse rounded-xs bg-muted-foreground align-middle" />
            )}
          </p>
        )}
        {meta && (
          <p
            className={cn(
              "mt-0.5 text-caption wrap-break-word",
              step.kind === "tool" && step.result && !step.result.ok ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {meta}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * Everything the agent did before (and around) the answer, in one block:
 * "Thinking… 4.2s" with a live counter while it works, then
 * "Thought for 6.7s · 3 steps". Open while it works, so reasoning and tool
 * calls stream in as they happen; collapsed once the answer starts, reopenable.
 */
export function ThoughtProcessView({
  steps,
  active,
  elapsedMs,
  thoughtMs,
  answered,
  docName,
}: {
  steps: Step[];
  /** The agent is working (not yet answering). Opens the block and runs the counter. */
  active: boolean;
  /** The counter's value while `active`. */
  elapsedMs: number;
  /** How long it thought before answering, once known. */
  thoughtMs: number | null;
  /** Answer text has arrived. */
  answered: boolean;
  /** Names a document id, for "Read document" steps. */
  docName?: (id: string) => string | undefined;
}) {
  const [open, setOpen] = useState(active);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current !== active) setOpen(active);
    wasActive.current = active;
  }, [active]);

  if (!active && steps.length === 0) return null;

  const stepCount = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const label = active
    ? "Thinking…"
    : answered && thoughtMs != null
      ? `Thought for ${formatSeconds(thoughtMs)}`
      : "Thought process";

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={steps.length === 0}
        className="flex min-h-8 items-center gap-2 rounded-sm text-left text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default disabled:hover:text-muted-foreground"
      >
        <Lightbulb className={cn("size-4 shrink-0", active && "animate-pulse")} aria-hidden />
        <span className="font-medium">{label}</span>
        {active ? (
          <span className="text-caption tabular-nums" aria-hidden>
            {formatSeconds(elapsedMs)}
          </span>
        ) : (
          <span className="text-caption">· {stepCount}</span>
        )}
        {steps.length > 0 && (
          <ChevronDown
            className={cn("size-3.5 shrink-0 transition-transform duration-200", !open && "-rotate-90")}
            aria-hidden
          />
        )}
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out-quart",
          open && steps.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <ol className="mt-2 ml-0.5" aria-label="Thinking steps">
            {steps.map((step, i) => (
              <StepRow
                key={step.key}
                step={step}
                last={i === steps.length - 1}
                active={active}
                docName={docName}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAuiState } from "@assistant-ui/react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { readCustom, type ToolTraceResult } from "@/lib/chat/convert";
import { cn } from "@/lib/utils";
import { describeArgs, formatMs } from "./tool-trace";

type ToolStep = {
  kind: "tool";
  key: string;
  name: string;
  args: Record<string, unknown>;
  /** Undefined while the call is still running. */
  result?: ToolTraceResult;
};

type ThoughtStep = {
  kind: "thought";
  key: string;
  heading: string | null;
  body: string;
  /** The section the model is still writing. */
  streaming: boolean;
};

type Step = ToolStep | ThoughtStep;

const TOOLS: Record<string, { icon: LucideIcon; running: string; done: string }> = {
  search_documents: { icon: Search, running: "Searching documents", done: "Searched documents" },
  get_document_text: { icon: FileText, running: "Reading document", done: "Read document" },
  query_table: { icon: Table2, running: "Querying table", done: "Queried table" },
  list_documents: { icon: Files, running: "Listing documents", done: "Listed documents" },
};

/**
 * A reasoning summary arrives as sections, each opening with a bold heading
 * (`**Planning the answer**`). Splits one reasoning part into those sections.
 */
function thoughtSections(text: string): { heading: string | null; body: string }[] {
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

/** Seconds since `start`, ticking while `active`. */
function useElapsedMs(start: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, now - start);
}

function formatSeconds(ms: number): string {
  return ms >= 10_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
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
  docName: (id: string) => string | undefined;
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
    detail = (step.name === "get_document_text" && docName(arg)) || arg || null;
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
export function ThoughtProcess() {
  const parts = useAuiState((s) => s.message.parts);
  const running = useAuiState((s) => s.message.status?.type === "running");
  const createdAt = useAuiState((s) => s.message.createdAt);
  const custom = useAuiState((s) => s.message.metadata.custom);
  const { metrics } = readCustom(custom);
  const { documents } = useDashboardData();

  // Working = running and the newest part is not answer text (or its sources).
  const lastType = parts[parts.length - 1]?.type;
  const active = running && lastType !== "text" && lastType !== "source";
  const hasText = parts.some((p) => p.type === "text" && p.text.trim().length > 0);

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    parts.forEach((p, i) => {
      if (p.type === "reasoning") {
        const sections = thoughtSections(p.text);
        sections.forEach((s, j) =>
          out.push({
            kind: "thought",
            key: `${i}-${j}`,
            ...s,
            streaming: active && i === parts.length - 1 && j === sections.length - 1,
          })
        );
      } else if (p.type === "tool-call") {
        const r =
          p.result && typeof p.result === "object" && "summary" in (p.result as object)
            ? (p.result as ToolTraceResult)
            : undefined;
        out.push({
          kind: "tool",
          key: p.toolCallId,
          name: p.toolName,
          args: p.args as Record<string, unknown>,
          result: r,
        });
      }
    });
    return out;
  }, [parts, active]);

  const start = createdAt.getTime();
  const elapsed = useElapsedMs(start, active);

  // How long the agent worked before answering: the server's time to first
  // answer token, or (until `message.end` brings it) the client's own measure.
  const [clientThoughtMs, setClientThoughtMs] = useState<number | null>(null);
  useEffect(() => {
    if (running && hasText && clientThoughtMs === null) setClientThoughtMs(Date.now() - start);
  }, [running, hasText, clientThoughtMs, start]);
  const thoughtMs =
    metrics?.ttft_ms ?? clientThoughtMs ?? (running && hasText ? Date.now() - start : null);

  const [open, setOpen] = useState(active);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current !== active) setOpen(active);
    wasActive.current = active;
  }, [active]);

  if (!active && steps.length === 0) return null;

  const docName = (id: string) => documents?.find((d) => d.id === id)?.file_name;
  const stepCount = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const label = active
    ? "Thinking…"
    : hasText && thoughtMs != null
      ? `Thought for ${formatSeconds(thoughtMs)}`
      : "Thought process";

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={steps.length === 0}
        className="group/thought flex min-h-8 items-center gap-2 rounded-sm text-left text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default disabled:hover:text-muted-foreground"
      >
        <Lightbulb className={cn("size-4 shrink-0", active && "animate-pulse")} aria-hidden />
        <span className="font-medium">{label}</span>
        {active ? (
          <span className="figure text-caption tabular-nums" aria-hidden>
            {formatSeconds(elapsed)}
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

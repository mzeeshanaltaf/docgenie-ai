"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { readCustom, type ToolTraceResult } from "@/lib/chat/convert";
import { ThoughtProcessView, thoughtSections, type Step } from "./thought-process-view";

/** Milliseconds since `start`, ticking while `active`. */
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

/** The thinking block of the current assistant message (see `ThoughtProcessView`). */
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

  return (
    <ThoughtProcessView
      steps={steps}
      active={active}
      elapsedMs={elapsed}
      thoughtMs={thoughtMs}
      answered={hasText}
      docName={(id) => documents?.find((d) => d.id === id)?.file_name}
    />
  );
}

"use client";

import { MessagePrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { citationFromSource } from "@/lib/chat/citations";
import { errorInfoFrom } from "@/lib/chat/errors";
import type { Citation } from "@/types/api";
import { useMemo } from "react";
import { AnswerText } from "./answer-markdown";
import { ChatErrorNotice } from "./chat-error";
import { SourceChip } from "./citation-mark";
import { MessageFooter } from "./message-footer";
import { ReasoningPart } from "./reasoning-block";
import { ToolCallPart } from "./tool-trace";
import { useViewer } from "./viewer-context";

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end pt-6">
      <div className="max-w-[85%] rounded-md bg-muted px-4 py-2.5 text-body whitespace-pre-wrap text-foreground wrap-break-word">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function SourcesRow() {
  const parts = useAuiState((s) => s.message.parts);
  const viewer = useViewer();
  const citations = useMemo(
    () =>
      parts
        .map((p) => citationFromSource(p))
        .filter((c): c is Citation => c !== null)
        .sort((a, b) => a.index - b.index),
    [parts]
  );
  if (citations.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="ds-label mb-1.5">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c) => (
          <SourceChip key={c.index} citation={c} onOpen={viewer.openCitation} />
        ))}
      </div>
    </div>
  );
}

/** Failed, interrupted or stopped answers say so, under whatever did arrive. */
function StatusNotice() {
  const aui = useAui();
  const status = useAuiState((s) => s.message.status);
  const error = errorInfoFrom(status);
  const isLast = useAuiState((s) => s.message.isLast);
  if (error) {
    return (
      <div className="mt-4">
        <ChatErrorNotice
          error={error}
          onRetry={isLast ? () => aui.message().reload() : undefined}
        />
      </div>
    );
  }
  if (status?.type === "incomplete" && status.reason === "cancelled") {
    return <p className="mt-4 text-body-sm text-muted-foreground">Stopped. The answer above is partial.</p>;
  }
  if (status?.type === "incomplete") {
    return (
      <p className="mt-4 flex items-center gap-2 text-body-sm text-warning">
        <span className="ds-label text-warning">Cut short</span>
        The answer stopped before it was finished.
      </p>
    );
  }
  return null;
}

function WorkingIndicator() {
  return (
    <p className="ds-label animate-pulse py-2" role="status">
      Working
    </p>
  );
}

export function AssistantMessage() {
  const running = useAuiState((s) => s.message.status?.type === "running");
  // Show the indicator while nothing else on screen says the agent is busy: at
  // the start, and in the gap after a tool call finishes.
  const waiting = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false;
    const last = s.message.parts[s.message.parts.length - 1];
    return !last || (last.type === "tool-call" && last.result !== undefined);
  });
  const hasAnswer = useAuiState((s) =>
    s.message.parts.some((p) => p.type === "text" && p.text.trim().length > 0)
  );
  return (
    <MessagePrimitive.Root className="pt-6">
      <div>
        <MessagePrimitive.Parts
          unstable_showEmptyOnNonTextEnd={false}
          components={{
            Reasoning: ReasoningPart,
            Text: AnswerText,
            Source: () => null,
            tools: { Fallback: ToolCallPart },
          }}
        />
      </div>
      {waiting && <WorkingIndicator />}
      <StatusNotice />
      {!running && <SourcesRow />}
      {!running && hasAnswer && <MessageFooter />}
    </MessagePrimitive.Root>
  );
}

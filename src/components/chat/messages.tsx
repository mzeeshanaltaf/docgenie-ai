"use client";

import { MessagePrimitive, useAui, useAuiState } from "@assistant-ui/react";
import { citationFromSource } from "@/lib/chat/citations";
import { readCustom } from "@/lib/chat/convert";
import { errorInfoFrom } from "@/lib/chat/errors";
import { formatMessageStamp } from "@/lib/format";
import type { Citation } from "@/types/api";
import { useMemo } from "react";
import { AnswerText } from "./answer-markdown";
import { ChatErrorNotice } from "./chat-error";
import { SourceChip } from "./citation-mark";
import { MessageFooter } from "./message-footer";
import { ThoughtProcess } from "./thought-process";
import { useViewer } from "./viewer-context";

export function UserMessage() {
  const createdAt = useAuiState((s) => s.message.createdAt);
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1 pt-6">
      <time dateTime={createdAt.toISOString()} className="text-caption text-muted-foreground">
        {formatMessageStamp(createdAt)}
      </time>
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

const Hidden = () => null;

export function AssistantMessage() {
  // The server id (the Liked list links to it); a live answer's runtime id is client-made.
  const id = useAuiState((s) => readCustom(s.message.metadata.custom).messageId ?? s.message.id);
  const running = useAuiState((s) => s.message.status?.type === "running");
  const hasAnswer = useAuiState((s) =>
    s.message.parts.some((p) => p.type === "text" && p.text.trim().length > 0)
  );
  return (
    // `group` lets the footer reveal the answer metrics on hover.
    // `data-highlight` is set briefly when the answer is opened from the Liked list.
    <MessagePrimitive.Root
      className="group/answer scroll-mt-6 rounded-sm pt-6 outline-offset-8 transition-[outline-color] duration-500 data-[highlight=true]:outline-2 data-[highlight=true]:outline-ring/60"
      data-message-id={id}
    >
      {/* Reasoning and tool calls render together in the thinking block. */}
      <ThoughtProcess />
      <div>
        <MessagePrimitive.Parts
          unstable_showEmptyOnNonTextEnd={false}
          components={{
            Reasoning: Hidden,
            Text: AnswerText,
            Source: Hidden,
            tools: { Fallback: Hidden },
          }}
        />
      </div>
      <StatusNotice />
      {!running && <SourcesRow />}
      {!running && hasAnswer && <MessageFooter />}
    </MessagePrimitive.Root>
  );
}

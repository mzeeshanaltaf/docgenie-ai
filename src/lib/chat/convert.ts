import type {
  ExportedMessageRepository,
  MessageStatus as UiMessageStatus,
  MessageTiming,
  ThreadAssistantMessagePart,
  ThreadMessage,
  ToolCallMessagePart,
} from "@assistant-ui/react";
import type {
  Citation,
  MessageMetrics,
  MessageOut,
  MessagePart,
} from "@/types/api";
import { sourceFromCitation } from "./citations";

/**
 * One tool call, as stored in the `result` of a `tool-call` part. The stream
 * never sends raw tool output, only a one-line summary and the duration.
 */
export type ToolTraceResult = {
  ok: boolean;
  summary: string;
  duration_ms: number;
};

/** What the adapter puts in `message.metadata.custom`. */
export type MessageCustom = {
  /** The assistant message's server id (use it for feedback). */
  messageId?: string;
  userMessageId?: string;
  /** Server timestamp of the turn, ISO 8601 UTC. */
  createdAt?: string;
  model?: string;
  metrics?: MessageMetrics;
};

export function readCustom(custom: unknown): MessageCustom {
  return (custom && typeof custom === "object" ? custom : {}) as MessageCustom;
}

export function toolPart(
  id: string,
  name: string,
  args: Record<string, unknown>,
  result?: ToolTraceResult
): ToolCallMessagePart {
  return {
    type: "tool-call",
    toolCallId: id,
    toolName: name,
    args: args as ToolCallMessagePart["args"],
    argsText: JSON.stringify(args),
    ...(result ? { result, isError: !result.ok } : {}),
  };
}

/**
 * Builds the assistant message's content incrementally from stream events.
 * `snapshot()` returns the cumulative array assistant-ui expects on each yield.
 */
export class PartsBuilder {
  private parts: ThreadAssistantMessagePart[] = [];
  private toolIndex = new Map<string, number>();

  reasoning(text: string) {
    const last = this.parts[this.parts.length - 1];
    if (last?.type === "reasoning") {
      this.parts[this.parts.length - 1] = { ...last, text: last.text + text };
    } else {
      this.parts.push({ type: "reasoning", text });
    }
  }

  text(text: string) {
    const last = this.parts[this.parts.length - 1];
    if (last?.type === "text") {
      this.parts[this.parts.length - 1] = { ...last, text: last.text + text };
    } else {
      this.parts.push({ type: "text", text });
    }
  }

  toolStart(id: string, name: string, args: Record<string, unknown>) {
    this.toolIndex.set(id, this.parts.length);
    this.parts.push(toolPart(id, name, args));
  }

  toolEnd(id: string, name: string, result: ToolTraceResult) {
    const i = this.toolIndex.get(id);
    const prev = i === undefined ? undefined : this.parts[i];
    const args =
      prev?.type === "tool-call" ? (prev.args as Record<string, unknown>) : {};
    const next = toolPart(id, name, args, result);
    if (i === undefined) {
      this.toolIndex.set(id, this.parts.length);
      this.parts.push(next);
    } else {
      this.parts[i] = next;
    }
  }

  citation(c: Citation) {
    this.parts.push(sourceFromCitation(c));
  }

  hasText() {
    return this.parts.some((p) => p.type === "text" && p.text.length > 0);
  }

  /** Marks tool calls that never got an end event (a dropped connection). */
  failOpenTools(summary: string) {
    for (const [id, i] of this.toolIndex) {
      const p = this.parts[i];
      if (p?.type === "tool-call" && p.result === undefined) {
        this.toolEnd(id, p.toolName, { ok: false, summary, duration_ms: 0 });
      }
    }
  }

  snapshot(): ThreadAssistantMessagePart[] {
    return [...this.parts];
  }
}

/** Converts a stored message's `parts` into assistant-ui content. */
export function contentFromStored(parts: MessagePart[]): ThreadAssistantMessagePart[] {
  const b = new PartsBuilder();
  for (const p of parts) {
    switch (p.type) {
      case "reasoning":
        b.reasoning(p.text);
        break;
      case "text":
        b.text(p.text);
        break;
      case "tool":
        b.toolStart(p.id, p.name, p.args);
        b.toolEnd(p.id, p.name, {
          ok: p.status !== "error",
          summary: p.result_summary,
          duration_ms: p.duration_ms,
        });
        break;
      case "citation":
        b.citation(p);
        break;
      case "error":
        break; // shown through the message status, not as a part
    }
  }
  return b.snapshot();
}

export function timingFromMetrics(
  m: MessageMetrics,
  startedAt: number,
  chunks: number
): MessageTiming {
  return {
    streamStartTime: startedAt,
    ...(m.ttft_ms != null ? { firstTokenTime: m.ttft_ms } : {}),
    totalStreamTime: m.total_ms,
    tokenCount: m.output_tokens,
    ...(m.tokens_per_s != null ? { tokensPerSecond: m.tokens_per_s } : {}),
    totalChunks: chunks,
    toolCallCount: m.tool_calls,
  };
}

export function uiStatusFromStored(
  status: MessageOut["status"],
  parts: MessagePart[] | null
): UiMessageStatus {
  if (status === "complete") return { type: "complete", reason: "stop" };
  const err = parts?.find((p) => p.type === "error");
  if (status === "error" || err) {
    return {
      type: "incomplete",
      reason: "error",
      error: err && err.type === "error" ? { code: err.code, message: err.message } : null,
    };
  }
  // `incomplete` (cut short after some text) and `stopped`.
  return { type: "incomplete", reason: "other" };
}

/** Turns `GET /api/sessions/{id}/messages` into the repository the runtime loads. */
export function repositoryFromMessages(messages: MessageOut[]): ExportedMessageRepository {
  const items: ExportedMessageRepository["messages"] = [];
  let parentId: string | null = null;
  for (const m of messages) {
    const createdAt = new Date(m.created_at);
    let message: ThreadMessage;
    if (m.role === "user") {
      message = {
        id: m.id,
        role: "user",
        content: [{ type: "text", text: m.content }],
        attachments: [],
        createdAt,
        metadata: { custom: {} },
      };
    } else {
      const custom: MessageCustom = {
        messageId: m.id,
        createdAt: m.created_at,
        ...(m.model ? { model: m.model } : {}),
        ...(m.metrics ? { metrics: m.metrics } : {}),
      };
      message = {
        id: m.id,
        role: "assistant",
        content: contentFromStored(m.parts ?? []),
        status: uiStatusFromStored(m.status, m.parts),
        createdAt,
        metadata: {
          unstable_state: null,
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          custom: custom as Record<string, unknown>,
          ...(m.metrics
            ? { timing: timingFromMetrics(m.metrics, createdAt.getTime(), 0) }
            : {}),
          ...(m.feedback
            ? {
                submittedFeedback: {
                  type: m.feedback.rating === "like" ? "positive" : "negative",
                  ...(m.feedback.comment ? { comment: m.feedback.comment } : {}),
                },
              }
            : {}),
        },
      };
    }
    items.push({ message, parentId });
    parentId = m.id;
  }
  return { headId: parentId, messages: items };
}

import type {
  AssistantClient,
  ChatModelAdapter,
  ChatModelRunResult,
} from "@assistant-ui/react";
import { readChatStream } from "@/lib/sse";
import type {
  ApiErrorBody,
  ChatRequest,
  ChatStreamEvent,
  MessageMetrics,
} from "@/types/api";
import {
  PartsBuilder,
  timingFromMetrics,
  type MessageCustom,
} from "./convert";
import type { ChatErrorInfo } from "./errors";
import { adoptDraft, publishTitle } from "./session-store";

type Status = NonNullable<ChatModelRunResult["status"]>;

const errorStatus = (e: ChatErrorInfo): Status => ({
  type: "incomplete",
  reason: "error",
  error: { code: e.code, message: e.message },
});

type AdapterOptions = {
  /** The aui client; used to find the current thread and create its session id. */
  aui: AssistantClient;
  /**
   * Called when a turn has settled, whatever the outcome (answer, error,
   * cancel). The credit may have been spent or refunded, so the credit
   * displays must be refreshed either way.
   */
  onTurnSettled: () => void;
};

function lastUserText(messages: readonly { role: string; content: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    return m.content
      .map((p: { type: string; text?: string }) => (p.type === "text" ? p.text ?? "" : ""))
      .join("")
      .trim();
  }
  return "";
}

/**
 * The `ChatModelAdapter` for `POST /api/chat`.
 *
 * Event mapping (contract: backend/docs/chat-stream.md):
 *   reasoning.delta -> `reasoning` part     tool.start/tool.end -> one `tool-call` part
 *   text.delta      -> `text` part          citation            -> `source` part
 *   message.start   -> metadata.custom {messageId, userMessageId, createdAt}
 *   message.end     -> metadata.timing + metadata.custom {model, metrics} + final status
 *   error           -> status incomplete/error with {code, message}
 *   session.title   -> read after the run has ended, see `drainTail`
 */
export function createChatAdapter({ aui, onTurnSettled }: AdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const parts = new PartsBuilder();
      const custom: MessageCustom = {};
      let settled = false;
      let unlink = () => {};
      const settle = () => {
        if (settled) return;
        settled = true;
        onTurnSettled();
      };
      const result = (status?: Status, extra?: Partial<NonNullable<ChatModelRunResult["metadata"]>>): ChatModelRunResult => ({
        content: parts.snapshot(),
        ...(status ? { status } : {}),
        metadata: { custom: { ...custom } as Record<string, unknown>, ...extra },
      });

      try {
        const text = lastUserText(messages);
        if (!text) return;

        // The first message creates the session, so its id is made on the client.
        // `initialize` runs the thread list adapter, which returns a fresh UUID.
        const { remoteId: sessionId } = await aui.threadListItem().initialize();
        const localId = aui.threadListItem().getState().id;
        const documentIds = adoptDraft(localId, sessionId);

        const body: ChatRequest = {
          session_id: sessionId,
          message: text,
          ...(documentIds ? { document_ids: documentIds } : {}),
        };

        // The runtime aborts its signal when the run ends, which would cut the
        // stream before `session.title`. The request therefore has its own
        // controller, linked to the runtime's signal only until the answer is
        // complete (see `message.end` below).
        const requestController = new AbortController();
        const forwardAbort = () => requestController.abort();
        abortSignal.addEventListener("abort", forwardAbort);
        unlink = () => abortSignal.removeEventListener("abort", forwardAbort);

        let res: Response;
        try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: requestController.signal,
          });
        } catch (err) {
          if (isAbort(err)) throw err;
          yield result(
            errorStatus({ code: "BACKEND_UNAVAILABLE", message: "The server could not be reached." })
          );
          return;
        }

        if (!res.ok) {
          // Nothing was stored or charged: 402 no credits, 404, 422, 502, 504.
          const err = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
          yield result(
            errorStatus({
              code: err?.status ?? `HTTP_${res.status}`,
              message: err?.message ?? "The request failed.",
            })
          );
          return;
        }

        const startedAt = Date.now();
        let chunks = 0;
        let failure: ChatErrorInfo | null = null;
        let ended = false;
        const events = readChatStream(res)[Symbol.asyncIterator]();

        try {
          while (true) {
            const next = await events.next();
            if (next.done) break;
            const ev: ChatStreamEvent = next.value;
            switch (ev.event) {
              case "message.start":
                custom.messageId = ev.data.message_id;
                custom.userMessageId = ev.data.user_message_id;
                custom.createdAt = ev.data.created_at;
                yield result();
                break;
              case "reasoning.delta":
                chunks++;
                parts.reasoning(ev.data.text);
                yield result();
                break;
              case "tool.start":
                parts.toolStart(ev.data.id, ev.data.name, ev.data.args);
                yield result();
                break;
              case "tool.end":
                parts.toolEnd(ev.data.id, ev.data.name, {
                  ok: ev.data.ok,
                  summary: ev.data.summary,
                  duration_ms: ev.data.duration_ms,
                });
                yield result();
                break;
              case "text.delta":
                chunks++;
                parts.text(ev.data.text);
                yield result();
                break;
              case "citation":
                parts.citation(ev.data);
                yield result();
                break;
              case "error":
                failure = { code: ev.data.code, message: ev.data.message };
                break;
              case "message.end": {
                ended = true;
                const metrics: MessageMetrics = ev.data.metrics;
                custom.model = metrics.model;
                custom.metrics = metrics;
                const status: Status =
                  ev.data.status === "complete"
                    ? { type: "complete", reason: "stop" }
                    : failure
                      ? errorStatus(failure)
                      : { type: "incomplete", reason: "other" };
                settle();
                // The tail of the stream still holds `session.title`; read it
                // in the background so the composer is free as soon as the
                // answer is complete.
                unlink();
                void drainTail(events, requestController);
                yield result(status, { timing: timingFromMetrics(metrics, startedAt, chunks) });
                return;
              }
              case "session.title":
                publishTitle(ev.data.session_id, ev.data.title);
                break;
            }
          }
        } catch (err) {
          if (isAbort(err) || abortSignal.aborted) throw err;
          // fall through: treated as an interrupted stream below
        }

        if (!ended) {
          // The connection ended (or broke) without a `message.end`.
          parts.failOpenTools("Interrupted");
          yield result(
            errorStatus(
              failure ?? {
                code: "STREAM_INTERRUPTED",
                message: "The connection dropped before the answer finished.",
              }
            )
          );
        }
      } finally {
        unlink();
        settle();
      }
    },
  };
}

/**
 * Reads what is left of the stream after `message.end` (just `session.title`).
 * Gives up after 20 s so a stalled connection cannot linger.
 */
async function drainTail(
  events: AsyncIterator<ChatStreamEvent>,
  controller: AbortController
): Promise<void> {
  const giveUp = setTimeout(() => controller.abort(), 20_000);
  try {
    while (true) {
      const next = await events.next();
      if (next.done) return;
      if (next.value.event === "session.title") {
        publishTitle(next.value.data.session_id, next.value.data.title);
      }
    }
  } catch {
    // The title is also fetched from /api/sessions as a fallback.
  } finally {
    clearTimeout(giveUp);
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === "AbortError"
    : err instanceof Error && err.name === "AbortError";
}

/**
 * Chat failures the UI knows how to explain. Codes come from three places:
 * the backend's pre-stream JSON errors (`INSUFFICIENT_CREDITS`, `NOT_FOUND`),
 * the stream's `error` event (`LLM_BUSY`, `LLM_TIMEOUT`, `LLM_ERROR`,
 * `INTERNAL_ERROR`) and the proxy (`BACKEND_UNAVAILABLE`, `BACKEND_TIMEOUT`).
 * `STREAM_INTERRUPTED` is made here when the connection drops mid-answer.
 */
export type ChatErrorInfo = { code: string; message: string };

export type ChatErrorView = {
  title: string;
  detail: string;
  /** A retry re-sends the question; only offered when nothing was charged or lost. */
  retryable: boolean;
  /** Offer a link to the pricing / credits page instead of a retry. */
  outOfCredits?: boolean;
};

const VIEWS: Record<string, ChatErrorView> = {
  INSUFFICIENT_CREDITS: {
    title: "No message credits left",
    detail: "This question was not sent and nothing was charged.",
    retryable: false,
    outOfCredits: true,
  },
  LLM_BUSY: {
    title: "The model is busy",
    detail:
      "The provider had no capacity for this request. Your credit was returned. Try again in a moment.",
    retryable: true,
  },
  LLM_TIMEOUT: {
    title: "The model took too long",
    detail: "The request timed out. Your credit was returned.",
    retryable: true,
  },
  LLM_ERROR: {
    title: "The model failed to answer",
    detail: "Your credit was returned. Try again.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    title: "Something went wrong on our side",
    detail: "Your credit was returned if no answer was produced.",
    retryable: true,
  },
  STREAM_INTERRUPTED: {
    title: "The connection dropped",
    detail:
      "The answer stopped before it finished. What arrived is kept above; ask again to get the rest.",
    retryable: true,
  },
  BACKEND_UNAVAILABLE: {
    title: "The service is unreachable",
    detail: "The server could not be reached. Check your connection and try again.",
    retryable: true,
  },
  BACKEND_TIMEOUT: {
    title: "The service did not respond",
    detail: "The request timed out. Try again.",
    retryable: true,
  },
  NOT_FOUND: {
    title: "That chat or document no longer exists",
    detail: "It may have been deleted. Start a new chat.",
    retryable: false,
  },
  UNAUTHORIZED: {
    title: "You are signed out",
    detail: "Sign in again to continue.",
    retryable: false,
  },
};

export function describeChatError(info: ChatErrorInfo | null): ChatErrorView {
  if (info && VIEWS[info.code]) return VIEWS[info.code];
  return {
    title: "The answer could not be completed",
    detail: info?.message || "Try again.",
    retryable: true,
  };
}

/** Reads the `{code, message}` object the adapter stores on a failed message. */
export function errorInfoFrom(status: unknown): ChatErrorInfo | null {
  if (!status || typeof status !== "object") return null;
  const s = status as { type?: string; reason?: string; error?: unknown };
  if (s.type !== "incomplete" || s.reason !== "error") return null;
  const e = s.error;
  if (e && typeof e === "object" && "code" in e) {
    const o = e as { code?: unknown; message?: unknown };
    return {
      code: typeof o.code === "string" ? o.code : "UNKNOWN",
      message: typeof o.message === "string" ? o.message : "",
    };
  }
  return {
    code: "UNKNOWN",
    message: typeof e === "string" ? e : "",
  };
}

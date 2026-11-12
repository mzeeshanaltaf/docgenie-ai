"use client";

import { useCallback, useEffect, useState } from "react";
import { useAui } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { FEEDBACK_CHANGED_EVENT } from "@/lib/chat/feedback";
import { formatMessageStamp } from "@/lib/format";
import type { LikedMessageListOut, LikedMessageOut } from "@/types/api";

/**
 * Brings a message into view once its chat has loaded, and marks it briefly.
 * The thread renders asynchronously after a switch, so this polls for the
 * element (`data-message-id` on the assistant message root) for a few seconds.
 */
function revealMessage(messageId: string) {
  const deadline = Date.now() + 8000;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!el) {
      if (Date.now() < deadline) window.setTimeout(tick, 100);
      return;
    }
    // Let the viewport finish its own scroll-to-bottom on load first.
    window.setTimeout(() => {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      el.dataset.highlight = "true";
      window.setTimeout(() => delete el.dataset.highlight, 2000);
    }, 250);
  };
  tick();
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; messages: LikedMessageOut[] };

function LikedRow({ item, onOpen }: { item: LikedMessageOut; onOpen: () => void }) {
  const when = new Date(item.created_at);
  return (
    <li className="border-b border-rule">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <p className="line-clamp-2 text-body-sm font-medium text-foreground">
          {item.question ?? item.session_title ?? "Answer"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-body-sm text-muted-foreground">{item.answer}</p>
        <p className="mt-1 flex min-w-0 gap-1.5 text-caption text-muted-foreground">
          <time dateTime={when.toISOString()} className="shrink-0">
            {formatMessageStamp(when)}
          </time>
          {item.session_title && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{item.session_title}</span>
            </>
          )}
        </p>
      </button>
    </li>
  );
}

/** The answers the user liked, newest first. Picking one opens its chat at that answer. */
export function LikedList({ onNavigate }: { onNavigate?: () => void }) {
  const aui = useAui();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/liked");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as LikedMessageListOut;
      setState({ kind: "ready", messages: data.messages });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
    // A like or unlike elsewhere on the page changes the list.
    const onChange = () => void load();
    window.addEventListener(FEEDBACK_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FEEDBACK_CHANGED_EVENT, onChange);
  }, [load]);

  const open = (item: LikedMessageOut) => {
    onNavigate?.();
    // Accepts the server (remote) id; the message is found once the chat renders.
    aui.threads().switchToThread(item.session_id);
    revealMessage(item.message_id);
  };

  if (state.kind === "loading") {
    return (
      <p className="px-3 py-4 text-body-sm text-muted-foreground" role="status">
        Loading liked answers…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="px-3 py-4">
        <p className="text-body-sm text-muted-foreground">Couldn&apos;t load your liked answers.</p>
        <Button type="button" size="xs" variant="outline" className="mt-2" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }
  if (state.messages.length === 0) {
    return (
      <p className="px-3 py-4 text-body-sm text-muted-foreground">
        No liked answers yet. Use the thumbs up under an answer to keep it here.
      </p>
    );
  }
  return (
    <ul aria-label="Liked answers">
      {state.messages.map((item) => (
        <LikedRow key={item.message_id} item={item} onOpen={() => open(item)} />
      ))}
    </ul>
  );
}

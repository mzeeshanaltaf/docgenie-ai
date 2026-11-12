"use client";

// TEMPORARY chat UI (Phase 5): the old screen re-pointed at the new backend so
// the app keeps working end to end. Phase 7 replaces it with the assistant-ui
// chat (reasoning, tool steps, click-through citations, document selection).
// What is deliberately minimal here: only `text.delta` is rendered, citations
// are appended as a plain "Sources" list, and `reasoning.*` / `tool.*` events
// are ignored.

import { useState, useCallback, useEffect, useRef } from "react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatSidebar } from "@/components/dashboard/chat/chat-sidebar";
import { ChatMessages } from "@/components/dashboard/chat/chat-messages";
import { ChatInput } from "@/components/dashboard/chat/chat-input";
import { readChatStream } from "@/lib/sse";
import { toast } from "sonner";
import type {
  ApiErrorBody,
  Citation,
  MessageListOut,
  MessageOut,
  SessionListOut,
  SessionOut,
} from "@/types/api";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  id?: string;
  reaction?: "like" | "dislike" | null;
}

/** Plain-text list of the sources an answer cites (temporary; see file header). */
function withSources(content: string, citations: Citation[]): string {
  if (citations.length === 0) return content;
  const lines = citations.map((c) => {
    const pages =
      c.page_start == null
        ? ""
        : c.page_end && c.page_end !== c.page_start
          ? `, pp. ${c.page_start}–${c.page_end}`
          : `, p. ${c.page_start}`;
    return `- [${c.index}] ${c.file_name}${pages}`;
  });
  return `${content}\n\n**Sources**\n\n${lines.join("\n")}`;
}

function toLocalMessages(messages: MessageOut[]): LocalMessage[] {
  const out: LocalMessage[] = [];
  for (const m of messages) {
    // A failed turn stored no answer; there is nothing to show for it.
    if (m.role === "assistant" && !m.content) continue;
    const citations = (m.parts ?? []).filter(
      (p): p is Extract<typeof p, { type: "citation" }> => p.type === "citation"
    );
    out.push({
      role: m.role,
      content:
        m.role === "assistant" ? withSources(m.content, citations) : m.content,
      timestamp: new Date(m.created_at),
      id: m.role === "assistant" ? m.id : undefined,
      reaction: m.feedback?.rating ?? null,
    });
  }
  return out;
}

export default function ChatPage() {
  const { refreshAll } = useDashboardData();
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | undefined>(
    undefined
  );
  const [streamingStartTime, setStreamingStartTime] = useState<Date | undefined>(
    undefined
  );
  const abortRef = useRef<AbortController | null>(null);
  // Ignores a slow history response if the user has already switched chats.
  const loadSeq = useRef(0);

  // Chat list (titles only; messages are loaded when a chat is opened).
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sessions", { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SessionListOut>) : null))
      .then((data) => data && setSessions(data.sessions))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setSessionsLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Closing the page cancels a run in flight (the backend keeps the partial answer).
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    loadSeq.current++;
    setIsLoading(false);
    setStreamingContent(undefined);
    setActiveSessionId(crypto.randomUUID());
    setLocalMessages([]);
  }, []);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    abortRef.current?.abort();
    const seq = ++loadSeq.current;
    setIsLoading(false);
    setStreamingContent(undefined);
    setActiveSessionId(sessionId);
    setLocalMessages([]);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as MessageListOut;
      if (seq === loadSeq.current) setLocalMessages(toLocalMessages(data.messages));
    } catch {
      if (seq === loadSeq.current) toast.error("Failed to load this chat");
    }
  }, []);

  const sendMessage = async (message: string, sessionId: string) => {
    setLocalMessages((prev) => [
      ...prev,
      { role: "user", content: message, timestamp: new Date() },
    ]);
    setIsLoading(true);
    setStreamingContent(undefined);
    setStreamingStartTime(undefined);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Nothing was stored or charged (402 no credits, 404, 422, 502...).
        const err = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        toast.error(err?.message || "Failed to get response");
        setLocalMessages((prev) => prev.slice(0, -1));
        await refreshAll();
        return;
      }

      let assistantId: string | undefined;
      let text = "";
      const citations: Citation[] = [];
      let errorMessage: string | undefined;
      let status: "complete" | "incomplete" | "error" | undefined;
      let finished = false;

      // Commit the answer once the run is over. The stream stays open a moment
      // longer for `session.title`, which must not keep the input disabled.
      const finish = () => {
        if (finished) return;
        finished = true;
        setStreamingContent(undefined);
        setStreamingStartTime(undefined);
        setIsLoading(false);
        if (text) {
          setLocalMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: withSources(text, citations),
              timestamp: new Date(),
              id: assistantId,
            },
          ]);
        }
        if (status === "error" || !text) {
          toast.error(errorMessage || "No answer was produced. Please try again.");
        } else if (status === "incomplete") {
          toast.warning("The answer was cut short.");
        }
        void refreshAll();
      };

      for await (const ev of readChatStream(res)) {
        switch (ev.event) {
          case "message.start":
            assistantId = ev.data.message_id;
            setSessions((prev) =>
              prev.some((s) => s.id === sessionId)
                ? prev
                : [
                    {
                      id: sessionId,
                      title: null,
                      document_ids: null,
                      created_at: ev.data.created_at,
                      updated_at: ev.data.created_at,
                    },
                    ...prev,
                  ]
            );
            break;
          case "text.delta":
            if (!text) setStreamingStartTime(new Date());
            text += ev.data.text;
            setStreamingContent(text);
            break;
          case "citation":
            citations.push(ev.data);
            break;
          case "error":
            errorMessage = ev.data.message;
            break;
          case "message.end":
            status = ev.data.status;
            finish();
            break;
          case "session.title":
            setSessions((prev) =>
              prev.map((s) =>
                s.id === ev.data.session_id ? { ...s, title: ev.data.title } : s
              )
            );
            break;
          // reasoning.delta, tool.start, tool.end: rendered by the Phase 7 chat.
        }
      }
      finish(); // the stream ended without message.end (connection dropped)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to send message");
      setStreamingContent(undefined);
      setStreamingStartTime(undefined);
      setIsLoading(false);
      void refreshAll();
    }
  };

  const handleSend = useCallback(
    (message: string) => {
      let sessionId = activeSessionId;
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        setActiveSessionId(sessionId);
      }
      void sendMessage(message, sessionId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId]
  );

  if (sessionsLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-lg border border-border overflow-hidden">
        <div className="w-64 shrink-0 border-r border-border p-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="mt-4 h-5 w-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-lg border border-border overflow-hidden">
      {/* Sidebar */}
      <div className="hidden w-64 shrink-0 md:block">
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-h-0">
        <ChatMessages
          messages={localMessages}
          isLoading={isLoading}
          streamingContent={streamingContent}
          streamingStartTime={streamingStartTime}
        />
        <ChatInput onSend={handleSend} disabled={isLoading} />
      </div>
    </div>
  );
}

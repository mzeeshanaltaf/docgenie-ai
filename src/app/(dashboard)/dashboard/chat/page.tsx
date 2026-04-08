"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatSidebar } from "@/components/dashboard/chat/chat-sidebar";
import { ChatMessages } from "@/components/dashboard/chat/chat-messages";
import { ChatInput } from "@/components/dashboard/chat/chat-input";
import { toast } from "sonner";
import type { ChatSession } from "@/types/n8n";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

function stripOuterQuotes(text: string): string {
  const t = text.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).trim() : t;
}

export default function ChatPage() {
  const { chatSessions, loading, refreshAll } = useDashboardData();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | undefined>(
    undefined
  );
  const [streamingStartTime, setStreamingStartTime] = useState<Date | undefined>(undefined);
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>(
    {}
  );
  const abortRef = useRef<AbortController | null>(null);

  // Load messages when switching sessions
  useEffect(() => {
    if (!activeSessionId || !chatSessions) {
      setLocalMessages([]);
      return;
    }

    const session = chatSessions.find(
      (s) => s.session_id === activeSessionId
    );
    if (session?.messages) {
      const msgs: LocalMessage[] = [];
      for (const m of session.messages) {
        const ts = m.created_at ? new Date(m.created_at) : undefined;
        msgs.push({ role: "user", content: m.user_message, timestamp: ts });
        msgs.push({ role: "assistant", content: m.ai_response, timestamp: ts });
      }
      setLocalMessages(msgs);
    } else {
      setLocalMessages([]);
    }
  }, [activeSessionId, chatSessions]);

  const handleNewChat = useCallback(() => {
    const newId = crypto.randomUUID();
    setActiveSessionId(newId);
    setLocalMessages([]);
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (!activeSessionId) {
        // Auto-create a new session if none active
        const newId = crypto.randomUUID();
        setActiveSessionId(newId);
        // Continue with this new ID
        sendMessage(message, newId, true);
        return;
      }

      const isFirstMessage = localMessages.length === 0;
      sendMessage(message, activeSessionId, isFirstMessage);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSessionId, localMessages]
  );

  const sendMessage = async (
    message: string,
    sessionId: string,
    isFirstMessage: boolean
  ) => {
    const userTimestamp = new Date();
    // Optimistic update — add user message
    setLocalMessages((prev) => [
      ...prev,
      { role: "user", content: message, timestamp: userTimestamp },
    ]);
    setIsLoading(true);
    setStreamingContent(undefined);
    setStreamingStartTime(undefined);

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: message, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage = "Failed to get response";
        try {
          const errData = await res.json();
          errorMessage = errData.message || errData.error || errorMessage;
        } catch {
          // body might not be JSON
        }
        toast.error(errorMessage);
        setLocalMessages((prev) => prev.slice(0, -1));
        setStreamingContent(undefined);
        setStreamingStartTime(undefined);
        return;
      }

      // Read the streaming response (n8n sends newline-delimited JSON objects)
      const reader = res.body?.getReader();
      if (!reader) {
        const text = await res.text();
        setStreamingContent(undefined);
        setStreamingStartTime(undefined);
        setLocalMessages((prev) => [
          ...prev,
          { role: "assistant", content: text || "No response", timestamp: new Date() },
        ]);
      } else {
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedText = "";
        let finalOutput = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete JSON objects separated by newlines
          const lines = buffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              if (event.type === "item" && event.content) {
                if (event.metadata?.nodeName === "Respond to Webhook") {
                  // Final response JSON — extract the output field
                  try {
                    const parsed = JSON.parse(event.content);
                    if (parsed.output) finalOutput = parsed.output;
                  } catch {
                    // Not JSON, ignore
                  }
                } else {
                  // AI token chunk — set start time on first token
                  if (!streamedText) setStreamingStartTime(new Date());
                  streamedText += event.content;
                  setStreamingContent(streamedText);
                }
              }
            } catch {
              // Incomplete or invalid JSON, skip
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim());
            if (event.type === "item" && event.content) {
              if (event.metadata?.nodeName === "Respond to Webhook") {
                try {
                  const parsed = JSON.parse(event.content);
                  if (parsed.output) finalOutput = parsed.output;
                } catch {
                  // Not JSON
                }
              } else {
                streamedText += event.content;
              }
            }
          } catch {
            // Incomplete JSON
          }
        }

        // Use the final webhook output if available, otherwise the streamed text
        // Strip outer quotes that n8n sometimes wraps the response in
        const raw = finalOutput || streamedText || "No response";
        const content = stripOuterQuotes(raw);
        setStreamingContent(undefined);
        setStreamingStartTime(undefined);
        setLocalMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() },
        ]);
      }

      // Fire-and-forget: generate title for first message
      if (isFirstMessage) {
        fetch("/api/chat/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: message, session_id: sessionId }),
        })
          .then((r) => r.json())
          .then((titleData) => {
            const title = Array.isArray(titleData)
              ? titleData[0]?.output?.title
              : titleData?.output?.title;
            if (title) {
              setSessionTitles((prev) => ({
                ...prev,
                [sessionId]: title,
              }));
            }
            refreshAll();
          })
          .catch(() => {
            // Title generation is non-critical
          });
      }

      refreshAll();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to send message");
      setLocalMessages((prev) => prev.slice(0, -1));
      setStreamingContent(undefined);
      setStreamingStartTime(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
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

  // Merge server sessions with local title overrides
  const displaySessions: ChatSession[] = [
    // If current session is new (not in server data), add it at top
    ...(activeSessionId &&
    !chatSessions?.find((s) => s.session_id === activeSessionId) &&
    localMessages.length > 0
      ? [
          {
            session_id: activeSessionId,
            chat_title:
              sessionTitles[activeSessionId] || "New Chat",
            messages: [],
          },
        ]
      : []),
    ...(chatSessions ?? []).map((s) => ({
      ...s,
      chat_title: sessionTitles[s.session_id] || s.chat_title,
    })),
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-lg border border-border overflow-hidden">
      {/* Sidebar */}
      <div className="hidden w-64 shrink-0 md:block">
        <ChatSidebar
          sessions={displaySessions}
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

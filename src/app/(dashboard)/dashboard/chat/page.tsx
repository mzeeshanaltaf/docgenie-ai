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
}

export default function ChatPage() {
  const { chatSessions, loading, refreshAll } = useDashboardData();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string | undefined>(
    undefined
  );
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
        msgs.push({ role: "user", content: m.user_message });
        msgs.push({ role: "assistant", content: m.ai_response });
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
    // Optimistic update — add user message
    setLocalMessages((prev) => [
      ...prev,
      { role: "user", content: message },
    ]);
    setIsLoading(true);
    setStreamingContent("");

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
        return;
      }

      // Read the streaming response
      const reader = res.body?.getReader();
      if (!reader) {
        // Fallback: non-streaming response
        const text = await res.text();
        setStreamingContent(undefined);
        setLocalMessages((prev) => [
          ...prev,
          { role: "assistant", content: text || "No response" },
        ]);
      } else {
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setStreamingContent(accumulated);
        }

        // Stream finished — move streaming content into final messages
        setStreamingContent(undefined);
        setLocalMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated || "No response" },
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
        />
        <ChatInput onSend={handleSend} disabled={isLoading} />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, User, Copy, Check } from "lucide-react";
import { LoadingDots } from "@/components/ui/loading-dots";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  streamingContent?: string;
  streamingStartTime?: Date;
}

function normalizeContent(text: string): string {
  return text.replace(/\\n/g, "\n");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
      title="Copy message"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export function ChatMessages({
  messages,
  isLoading,
  streamingContent,
  streamingStartTime,
}: ChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, streamingContent]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center px-4">
        <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="text-lg font-semibold">Ask a question</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Ask anything about your uploaded documents. DocGenie will find the
          answer.
        </p>
      </div>
    );
  }

  const isStreaming = typeof streamingContent === "string";

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {messages.map((msg, i) => {
          const content = normalizeContent(msg.content);
          return (
            <div
              key={i}
              className={`group flex gap-3 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
              <div
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[80%]`}
              >
                <div
                  className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950"
                      : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{content}</p>
                </div>
                {msg.timestamp && (
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {formatTime(msg.timestamp)}
                  </span>
                )}
              </div>
              <CopyButton text={content} />
              {msg.role === "user" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming assistant message */}
        {isStreaming && (
          <div className="group flex gap-3 justify-start">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex flex-col items-start max-w-[80%]">
              <div className="relative rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed">
                <p className="whitespace-pre-wrap">
                  {normalizeContent(streamingContent)}
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-text-bottom ml-0.5" />
                </p>
              </div>
              {streamingStartTime && (
                <span className="mt-1 text-[10px] text-muted-foreground">
                  {formatTime(streamingStartTime)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Waiting dots (before stream starts) */}
        {isLoading && !isStreaming && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="rounded-2xl bg-muted px-4 py-3">
              <LoadingDots size={6} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

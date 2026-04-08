"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, User, Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { LoadingDots } from "@/components/ui/loading-dots";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  id?: number;
  reaction?: "like" | "dislike" | null;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  streamingContent?: string;
  streamingStartTime?: Date;
  sessionId?: string;
}

function normalizeContent(text: string): string {
  return text.replace(/\\n/g, "\n");
}

function stripOuterQuotes(text: string): string {
  const t = text.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 last:mb-0 list-disc pl-5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 last:mb-0 list-decimal pl-5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          return isBlock ? (
            <code className="block bg-black/10 dark:bg-white/10 rounded px-3 py-2 text-xs font-mono my-2 overflow-x-auto whitespace-pre">{children}</code>
          ) : (
            <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
          );
        },
        pre: ({ children }) => <pre className="my-2">{children}</pre>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic my-2">{children}</blockquote>,
        hr: () => <hr className="my-3 border-muted-foreground/20" />,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">{children}</a>,
        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
        th: ({ children }) => <th className="border border-muted-foreground/30 px-2 py-1 bg-black/5 dark:bg-white/5 font-semibold text-left">{children}</th>,
        td: ({ children }) => <td className="border border-muted-foreground/30 px-2 py-1">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
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

function ReactionButtons({
  messageId,
  sessionId,
  initialReaction,
}: {
  messageId: number;
  sessionId: string;
  initialReaction?: "like" | "dislike" | null;
}) {
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(
    initialReaction ?? null
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (r: "like" | "dislike") => {
    const next = reaction === r ? null : r;
    setReaction(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch("/api/chat/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, id: messageId, reaction: next }),
      }).catch(() => {/* fire-and-forget */});
    }, 600);
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={() => handleClick("like")}
        title="Like"
        className={`rounded p-1 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${
          reaction === "like"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground opacity-0 group-hover:opacity-100"
        }`}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => handleClick("dislike")}
        title="Dislike"
        className={`rounded p-1 transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${
          reaction === "dislike"
            ? "text-red-500 dark:text-red-400"
            : "text-muted-foreground opacity-0 group-hover:opacity-100"
        }`}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ChatMessages({
  messages,
  isLoading,
  streamingContent,
  streamingStartTime,
  sessionId,
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
          const content = normalizeContent(stripOuterQuotes(msg.content));
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
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{content}</p>
                  ) : (
                    <MarkdownContent content={content} />
                  )}
                </div>
                {msg.timestamp && (
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    {formatTime(msg.timestamp)}
                  </span>
                )}
                {msg.role === "assistant" && msg.id != null && sessionId && (
                  <ReactionButtons
                    messageId={msg.id}
                    sessionId={sessionId}
                    initialReaction={msg.reaction}
                  />
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
                <MarkdownContent content={normalizeContent(stripOuterQuotes(streamingContent))} />
                <span className="inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-text-bottom ml-0.5" />
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

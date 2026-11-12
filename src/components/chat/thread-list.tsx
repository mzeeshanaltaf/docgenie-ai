"use client";

import { useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  AuiIf,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function ThreadRow({ onNavigate }: { onNavigate?: () => void }) {
  const aui = useAui();
  const active = useAuiState((s) => s.threads.mainThreadId === s.threadListItem.id);
  const title = useAuiState((s) => s.threadListItem.title);
  const [mode, setMode] = useState<"view" | "rename" | "confirm-delete">("view");
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = () => {
    const next = draft.trim();
    setMode("view");
    if (next && next !== title) aui.threadListItem().rename(next);
  };

  if (mode === "rename") {
    return (
      <div className="flex h-10 items-center gap-1 border-b border-rule px-2">
        <Input
          ref={inputRef}
          autoFocus
          value={draft}
          maxLength={120}
          aria-label="Chat name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setMode("view");
          }}
          className="h-8 text-body-sm"
        />
        <Button type="button" size="icon-sm" variant="ghost" onClick={commitRename} aria-label="Save name">
          <Check aria-hidden />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setMode("view")} aria-label="Cancel">
          <X aria-hidden />
        </Button>
      </div>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className="flex h-10 items-center gap-1 border-b border-rule px-2">
        <span className="min-w-0 flex-1 truncate text-body-sm text-foreground">Delete this chat?</span>
        <ThreadListItemPrimitive.Delete asChild>
          <Button type="button" size="xs" variant="destructive">
            <Trash2 aria-hidden /> Delete
          </Button>
        </ThreadListItemPrimitive.Delete>
        <Button type="button" size="xs" variant="ghost" onClick={() => setMode("view")}>
          Keep
        </Button>
      </div>
    );
  }

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        "group flex h-10 items-center border-b border-rule pr-1 transition-colors hover:bg-accent",
        active && "bg-accent"
      )}
    >
      <ThreadListItemPrimitive.Trigger
        onClick={onNavigate}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center px-3 text-left text-body-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          active ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        <span className="truncate">
          <ThreadListItemPrimitive.Title fallback="New chat" />
        </span>
      </ThreadListItemPrimitive.Trigger>
      <div className="flex shrink-0 items-center opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Rename chat"
          onClick={() => {
            setDraft(title ?? "");
            setMode("rename");
          }}
        >
          <Pencil aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Delete chat"
          onClick={() => setMode("confirm-delete")}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </ThreadListItemPrimitive.Root>
  );
}

/** The list of chats with a "New chat" action. Rename and delete are inline. */
export function ChatThreadList({ onNavigate }: { onNavigate?: () => void }) {
  const loading = useAuiState((s) => s.threads.isLoading);
  return (
    <ThreadListPrimitive.Root className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <ThreadListPrimitive.New asChild>
          <Button type="button" variant="outline" className="w-full justify-start" onClick={onNavigate}>
            <Plus aria-hidden /> New chat
          </Button>
        </ThreadListPrimitive.New>
      </div>
      <p className="ds-label px-3 pb-1.5">Chats</p>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-rule">
        <AuiIf condition={(s) => s.threads.isLoading}>
          <p className="px-3 py-4 text-body-sm text-muted-foreground">Loading chats…</p>
        </AuiIf>
        <AuiIf condition={(s) => !s.threads.isLoading && s.threads.threadIds.length === 0}>
          <p className="px-3 py-4 text-body-sm text-muted-foreground">
            No chats yet. Ask a question to start one.
          </p>
        </AuiIf>
        {!loading && (
          <ThreadListPrimitive.Items>
            {() => <ThreadRow onNavigate={onNavigate} />}
          </ThreadListPrimitive.Items>
        )}
      </div>
    </ThreadListPrimitive.Root>
  );
}

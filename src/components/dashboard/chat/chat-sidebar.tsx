"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/types/n8n";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

function getSessionDate(session: ChatSession): Date {
  if (session.messages && session.messages.length > 0) {
    const last = session.messages[session.messages.length - 1];
    if (last.created_at) return new Date(last.created_at);
  }
  return new Date();
}

function getDateGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  if (d >= sevenDaysAgo) return "Last 7 days";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "Last 7 days", "Older"];

function groupSessions(sessions: ChatSession[]): { label: string; sessions: ChatSession[] }[] {
  const map: Record<string, ChatSession[]> = {};

  for (const session of sessions) {
    const group = getDateGroup(getSessionDate(session));
    if (!map[group]) map[group] = [];
    map[group].push(session);
  }

  return GROUP_ORDER
    .filter((label) => map[label] && map[label].length > 0)
    .map((label) => ({ label, sessions: map[label] }));
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatSidebarProps) {
  const groups = groupSessions(sessions);

  return (
    <div className="flex h-full flex-col border-r border-border bg-muted/20">
      <div className="p-3">
        <Button
          onClick={onNewChat}
          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="pb-3">
          {sessions.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
                <div className="space-y-1 px-3">
                  {group.sessions.map((session) => (
                    <button
                      key={session.session_id}
                      onClick={() => onSelectSession(session.session_id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        activeSessionId === session.session_id
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {session.chat_title || "New Chat"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

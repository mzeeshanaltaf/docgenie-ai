"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDocGenieRuntime } from "@/lib/chat/runtime";
import { Thread } from "./thread";
import { ChatSidebar } from "./chat-sidebar";
import { ViewerDock } from "./viewer-dock";
import { ViewerProvider } from "./viewer-context";

function ChatLayout() {
  const [listOpen, setListOpen] = useState(false);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden bg-background">
      {/* Chats: a column from md up, a sheet below */}
      <aside className="hidden w-64 shrink-0 border-r border-rule bg-card md:block" aria-label="Chats">
        <ChatSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center border-b border-rule px-2 md:hidden">
          <Sheet open={listOpen} onOpenChange={setListOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <MessageSquare aria-hidden /> Chats
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Chats</SheetTitle>
              <ChatSidebar onNavigate={() => setListOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>

      {/* Source viewer: docked from lg up, a sheet below */}
      <ViewerDock asideClassName="w-[min(40rem,46%)]" />
    </div>
  );
}

/**
 * The whole chat screen. Mounted by the chat page through `next/dynamic` with
 * `ssr: false`: thread ids are generated on the client, so a server render would
 * not match the first client render.
 */
export default function ChatApp() {
  const runtime = useDocGenieRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ViewerProvider>
        <ChatLayout />
      </ViewerProvider>
    </AssistantRuntimeProvider>
  );
}

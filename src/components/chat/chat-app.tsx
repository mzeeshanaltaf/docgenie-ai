"use client";

import { useState, useSyncExternalStore } from "react";
import { MessageSquare } from "lucide-react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useDocGenieRuntime } from "@/lib/chat/runtime";
import { DocumentViewer } from "./document-viewer";
import { Thread } from "./thread";
import { ChatThreadList } from "./thread-list";
import { ViewerProvider, useViewer } from "./viewer-context";

/** True from the `lg` breakpoint up, where the viewer docks beside the chat. */
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}

function ChatLayout() {
  const { target, close } = useViewer();
  const desktop = useIsDesktop();
  const [listOpen, setListOpen] = useState(false);

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-96 overflow-hidden rounded-lg border border-border bg-background">
      {/* Chats: a column from md up, a sheet below */}
      <aside className="hidden w-64 shrink-0 border-r border-rule bg-card md:block" aria-label="Chats">
        <ChatThreadList />
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
              <ChatThreadList onNavigate={() => setListOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>

      {/* Source viewer: docked from lg up, a sheet below */}
      {target && desktop && (
        <aside className="w-[min(40rem,46%)] shrink-0 border-l border-rule">
          <DocumentViewer target={target} onClose={close} />
        </aside>
      )}
      {!desktop && (
        <Sheet open={target !== null} onOpenChange={(o) => !o && close()}>
          <SheetContent side="right" showCloseButton={false} className="w-full max-w-none p-0 sm:max-w-xl">
            <SheetTitle className="sr-only">Source document</SheetTitle>
            {target && <DocumentViewer target={target} onClose={close} />}
          </SheetContent>
        </Sheet>
      )}
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

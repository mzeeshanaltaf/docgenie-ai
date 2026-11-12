"use client";

import { ArrowDown } from "lucide-react";
import { AuiIf, ThreadPrimitive } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { Composer } from "./composer";
import { AssistantMessage, UserMessage } from "./messages";

function EmptyThread() {
  return (
    <div className="py-16">
      <h2 className="text-headline text-foreground">Ask your documents</h2>
      <p className="measure mt-2 text-body text-muted-foreground">
        Answers cite the page they came from. Pick which documents to search below the message box.
      </p>
    </div>
  );
}

/** The conversation: messages, an empty state, and the composer. */
export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-background">
      <ThreadPrimitive.Viewport className="relative min-h-0 flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto w-full max-w-3xl px-4 pb-6">
          <AuiIf condition={(s) => s.thread.isEmpty && !s.thread.isLoading}>
            <EmptyThread />
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isLoading}>
            <p className="py-10 text-body-sm text-muted-foreground" role="status">
              Loading messages…
            </p>
          </AuiIf>
          <ThreadPrimitive.Messages>
            {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
          </ThreadPrimitive.Messages>
        </div>
        <ThreadPrimitive.ViewportFooter className="pointer-events-none sticky bottom-3 flex justify-center">
          <ThreadPrimitive.ScrollToBottom asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="pointer-events-auto bg-card disabled:hidden"
              aria-label="Scroll to latest"
            >
              <ArrowDown aria-hidden />
            </Button>
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

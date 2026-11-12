"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Thread ids are made on the client and the PDF viewer needs browser APIs, so
// the chat is never rendered on the server (a mismatch would leave dead UI).
const ChatApp = dynamic(() => import("@/components/chat/chat-app"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden">
      <div className="hidden w-64 shrink-0 space-y-2 border-r border-rule p-3 md:block">
        <Skeleton className="h-9 w-full" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1" />
    </div>
  ),
});

export default function ChatPage() {
  return (
    <>
      {/* The page has no visible title (the breadcrumb names it); screen readers still need one. */}
      <h1 className="sr-only">Chat</h1>
      <ChatApp />
    </>
  );
}

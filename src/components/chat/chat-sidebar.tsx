"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LikedList } from "./liked-list";
import { ChatThreadList } from "./thread-list";

const triggerClass =
  "flex-none px-0 pb-2 text-body-sm group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]";

/** The chat column: the list of chats, or the answers the user liked. */
export function ChatSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [tab, setTab] = useState("chats");
  return (
    <Tabs value={tab} onValueChange={setTab} className="h-full min-h-0 gap-0">
      <TabsList
        variant="line"
        aria-label="Chat lists"
        className="h-auto w-full shrink-0 justify-start gap-5 rounded-none border-b border-rule px-3 pt-3 pb-0"
      >
        <TabsTrigger value="chats" className={triggerClass}>
          Chats
        </TabsTrigger>
        <TabsTrigger value="liked" className={triggerClass}>
          Liked
        </TabsTrigger>
      </TabsList>
      <TabsContent value="chats" className="min-h-0">
        <ChatThreadList onNavigate={onNavigate} />
      </TabsContent>
      {/* Mounted only while shown, so it reloads each time it is opened. */}
      <TabsContent value="liked" className="min-h-0 overflow-y-auto">
        <LikedList onNavigate={onNavigate} />
      </TabsContent>
    </Tabs>
  );
}

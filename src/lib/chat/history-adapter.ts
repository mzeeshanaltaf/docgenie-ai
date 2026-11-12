import type { AssistantClient, ThreadHistoryAdapter } from "@assistant-ui/react";
import type { MessageListOut } from "@/types/api";
import { repositoryFromMessages } from "./convert";

/**
 * Loads a chat's messages from `GET /api/sessions/{id}/messages`.
 *
 * The backend already persists every turn while it streams, so `append` has
 * nothing to do. The thread's session id is read lazily at call time (it only
 * exists once the first message has been sent).
 */
export function createHistoryAdapter(aui: AssistantClient): ThreadHistoryAdapter {
  return {
    async load() {
      const remoteId = aui.threadListItem().getState().remoteId;
      if (!remoteId) return { messages: [] };
      const res = await fetch(`/api/sessions/${remoteId}/messages`);
      if (!res.ok) throw new Error(`Failed to load messages (${res.status})`);
      const data = (await res.json()) as MessageListOut;
      return repositoryFromMessages(data.messages);
    },
    async append() {},
  };
}

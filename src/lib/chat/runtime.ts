"use client";

import { useEffect, useMemo } from "react";
import {
  useAui,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { createChatAdapter } from "./adapter";
import { feedbackAdapter } from "./feedback";
import { createHistoryAdapter } from "./history-adapter";
import { threadListAdapter } from "./thread-list-adapter";

/**
 * Set by `useDocGenieRuntime`; read by the chat adapter after each turn. A
 * module-level holder keeps the adapter and the runtime hook referentially
 * stable while still reaching the current `refreshAll`.
 */
const turnSettled = { current: () => {} };

/** Per-thread adapters the runtime hands to the local runtime (message history). */
function useThreadAdapters() {
  const aui = useAui();
  return useMemo(() => ({ history: createHistoryAdapter(aui) }), [aui]);
}

const adapter: RemoteThreadListAdapter = {
  ...threadListAdapter,
  unstable_useAdapters: useThreadAdapters,
};

function useThreadRuntime() {
  const aui = useAui();
  const chatModel = useMemo(
    () => createChatAdapter({ aui, onTurnSettled: () => turnSettled.current() }),
    [aui]
  );
  return useLocalRuntime(chatModel, { adapters: { feedback: feedbackAdapter } });
}

/**
 * The chat runtime: a local runtime driven by the `/api/chat` SSE adapter, with
 * threads backed by `/api/sessions` and messages loaded from the backend.
 */
export function useDocGenieRuntime() {
  const { refreshAll } = useDashboardData();
  useEffect(() => {
    // Credits are spent or refunded by every turn, so refresh after each one.
    turnSettled.current = () => void refreshAll();
    return () => {
      turnSettled.current = () => {};
    };
  }, [refreshAll]);

  return useRemoteThreadListRuntime({
    runtimeHook: useThreadRuntime,
    adapter,
  });
}

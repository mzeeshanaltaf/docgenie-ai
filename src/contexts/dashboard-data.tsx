"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type {
  UserAnalyticsResponse,
  DocumentRecord,
  ChatSession,
  CreditBalanceResponse,
  CreditTransaction,
  CreditHistoryResponse,
} from "@/types/n8n";

interface DashboardDataContextType {
  analytics: UserAnalyticsResponse | null;
  documents: DocumentRecord[] | null;
  chatSessions: ChatSession[] | null;
  creditBalance: number | null;
  messageBalance: number | null;
  creditHistory: CreditTransaction[] | null;
  loading: boolean;
  refreshAll: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  refreshDocuments: () => Promise<void>;
  refreshChatSessions: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextType | null>(
  null
);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [analytics, setAnalytics] = useState<UserAnalyticsResponse | null>(
    null
  );
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[] | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [messageBalance, setMessageBalance] = useState<number | null>(null);
  const [creditHistory, setCreditHistory] = useState<
    CreditTransaction[] | null
  >(null);
  const [loading, setLoading] = useState(true);

  // Initial fetch on mount (AbortController handles React 18 Strict Mode)
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function load() {
      try {
        const [analyticsRes, docsRes, chatRes, balanceRes, historyRes] =
          await Promise.all([
            fetch("/api/analytics", { signal }),
            fetch("/api/documents/list", { signal }),
            fetch("/api/chat/history", { signal }),
            fetch("/api/credits/balance", { signal }),
            fetch("/api/credits/history", { signal }),
          ]);

        if (signal.aborted) return;

        if (analyticsRes.ok) {
          setAnalytics(await analyticsRes.json());
        }
        if (docsRes.ok) {
          const d = await docsRes.json();
          setDocuments(Array.isArray(d) ? d : []);
        }
        if (chatRes.ok) {
          const d = await chatRes.json();
          setChatSessions(Array.isArray(d) ? d : []);
        }
        if (balanceRes.ok) {
          const d: CreditBalanceResponse = await balanceRes.json();
          setCreditBalance(d.credit_balance ?? 0);
          setMessageBalance(d.message_balance ?? 0);
        }
        if (historyRes.ok) {
          const d: CreditHistoryResponse = await historyRes.json();
          setCreditHistory(Array.isArray(d) ? d : []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [analyticsRes, docsRes, chatRes, balanceRes, historyRes] =
        await Promise.all([
          fetch("/api/analytics"),
          fetch("/api/documents/list"),
          fetch("/api/chat/history"),
          fetch("/api/credits/balance"),
          fetch("/api/credits/history"),
        ]);

      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (docsRes.ok) {
        const d = await docsRes.json();
        setDocuments(Array.isArray(d) ? d : []);
      }
      if (chatRes.ok) {
        const d = await chatRes.json();
        setChatSessions(Array.isArray(d) ? d : []);
      }
      if (balanceRes.ok) {
        const d: CreditBalanceResponse = await balanceRes.json();
        setCreditBalance(d.credit_balance ?? 0);
        setMessageBalance(d.message_balance ?? 0);
      }
      if (historyRes.ok) {
        const d: CreditHistoryResponse = await historyRes.json();
        setCreditHistory(Array.isArray(d) ? d : []);
      }
    } catch {
      // fail silently
    }
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch("/api/credits/balance");
      if (res.ok) {
        const d: CreditBalanceResponse = await res.json();
        setCreditBalance(d.credit_balance ?? 0);
        setMessageBalance(d.message_balance ?? 0);
      }
    } catch {
      // fail silently
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents/list");
      if (res.ok) {
        const d = await res.json();
        setDocuments(Array.isArray(d) ? d : []);
      }
    } catch {
      // fail silently
    }
  }, []);

  const refreshChatSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) {
        const d = await res.json();
        setChatSessions(Array.isArray(d) ? d : []);
      }
    } catch {
      // fail silently
    }
  }, []);

  return (
    <DashboardDataContext.Provider
      value={{
        analytics,
        documents,
        chatSessions,
        creditBalance,
        messageBalance,
        creditHistory,
        loading,
        refreshAll,
        refreshCredits,
        refreshDocuments,
        refreshChatSessions,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx)
    throw new Error(
      "useDashboardData must be used within DashboardDataProvider"
    );
  return ctx;
}

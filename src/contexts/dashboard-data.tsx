"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  DocumentRecord,
  ChatSession,
  CreditTransaction,
  UserDashboardData,
} from "@/types/n8n";

interface DashboardDataContextType {
  totalDocuments: number;
  documents: DocumentRecord[] | null;
  chatSessions: ChatSession[] | null;
  creditBalance: number | null;
  messageBalance: number | null;
  creditHistory: CreditTransaction[] | null;
  loading: boolean;
  refreshAll: () => Promise<void>;
  previewDocuments: DocumentRecord[] | null;
  loadPreviewDocuments: () => Promise<DocumentRecord[]>;
}

const DashboardDataContext = createContext<DashboardDataContextType | null>(
  null
);

/** Apply a unified API response to all state setters. */
function applyDashboardData(
  data: UserDashboardData,
  setters: {
    setDocuments: (v: DocumentRecord[]) => void;
    setChatSessions: (v: ChatSession[]) => void;
    setCreditBalance: (v: number) => void;
    setMessageBalance: (v: number) => void;
    setCreditHistory: (v: CreditTransaction[]) => void;
    setTotalDocuments: (v: number) => void;
  }
) {
  setters.setDocuments(data.documents);
  setters.setChatSessions(data.chat_sessions);
  setters.setCreditBalance(data.account_summary.credit_balance);
  setters.setMessageBalance(data.account_summary.message_balance);
  setters.setTotalDocuments(data.account_summary.user_documents);
  setters.setCreditHistory(data.credit_transactions);
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[] | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [messageBalance, setMessageBalance] = useState<number | null>(null);
  const [creditHistory, setCreditHistory] = useState<
    CreditTransaction[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [previewDocuments, setPreviewDocuments] = useState<DocumentRecord[] | null>(null);
  // Track document IDs to detect real document list changes (not chat/credit updates)
  const docIdsRef = useRef<string>("");

  const setters = {
    setDocuments,
    setChatSessions,
    setCreditBalance,
    setMessageBalance,
    setCreditHistory,
    setTotalDocuments,
  };

  // Single fetch on mount — fetch dashboard data and preview documents in parallel
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function load() {
      try {
        const [userDataRes, previewRes] = await Promise.all([
          fetch("/api/user-data", { signal }),
          fetch("/api/documents/preview", { signal }),
        ]);
        if (signal.aborted) return;

        if (userDataRes.ok) {
          const data: UserDashboardData = await userDataRes.json();
          docIdsRef.current = data.documents.map((d) => d.file_id).sort().join(",");
          applyDashboardData(data, setters);
        }
        if (previewRes.ok) {
          const preview: DocumentRecord[] = await previewRes.json();
          setPreviewDocuments(preview);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single refresh function — one webhook call updates everything
  const refreshAll = useCallback(async () => {
    try {
      const res = await fetch("/api/user-data");
      if (res.ok) {
        const data: UserDashboardData = await res.json();
        const newDocIds = data.documents.map((d) => d.file_id).sort().join(",");
        const docsChanged = newDocIds !== docIdsRef.current;
        if (docsChanged) {
          docIdsRef.current = newDocIds;
          // Re-fetch preview documents in the background so cache stays warm
          fetch("/api/documents/preview")
            .then((r) => (r.ok ? r.json() : null))
            .then((preview) => { if (preview) setPreviewDocuments(preview); })
            .catch(() => setPreviewDocuments(null));
        }
        applyDashboardData(data, setters);
      }
    } catch {
      // fail silently
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazy-load preview documents (with base64). Returns cached data if available.
  const loadPreviewDocuments = useCallback(async (): Promise<DocumentRecord[]> => {
    if (previewDocuments !== null) return previewDocuments;
    const res = await fetch("/api/documents/preview");
    if (!res.ok) throw new Error("Failed to load preview documents");
    const data: DocumentRecord[] = await res.json();
    setPreviewDocuments(data);
    return data;
  }, [previewDocuments]);

  return (
    <DashboardDataContext.Provider
      value={{
        totalDocuments,
        documents,
        chatSessions,
        creditBalance,
        messageBalance,
        creditHistory,
        loading,
        refreshAll,
        previewDocuments,
        loadPreviewDocuments,
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

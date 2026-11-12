"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type {
  DashboardOut,
  DocumentListOut,
  DocumentOut,
} from "@/types/api";

/** How often documents that are still `processing` are re-checked. */
const POLL_INTERVAL_MS = 2000;

interface DashboardDataContextType {
  /** Summary from GET /api/dashboard (balances, counts, recent items, usage); null until loaded. */
  dashboard: DashboardOut | null;
  /** All of the user's documents, newest first; null until loaded. No file bytes. */
  documents: DocumentOut[] | null;
  /** Convenience copies of dashboard.balances / counts (null until loaded). */
  creditBalance: number | null;
  messageBalance: number | null;
  totalDocuments: number;
  /** True only until the first load finishes. */
  loading: boolean;
  /**
   * Re-fetch the dashboard summary and the documents list. Call after ANY
   * action that changes credits or data (upload, delete, chat message).
   */
  refreshAll: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataContextType | null>(
  null
);

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { signal });
  return res.ok ? ((await res.json()) as T) : null;
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardOut | null>(null);
  const [documents, setDocuments] = useState<DocumentOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Only the newest request may write state, so a slow older response can't
  // overwrite a fresher one.
  const requestSeq = useRef(0);

  const refreshAll = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const [dash, docs] = await Promise.all([
        getJson<DashboardOut>("/api/dashboard"),
        getJson<DocumentListOut>("/api/documents"),
      ]);
      if (seq !== requestSeq.current) return;
      if (dash) setDashboard(dash);
      if (docs) setDocuments(docs.documents);
    } catch {
      // Network blip: keep what we have; the next refresh will catch up.
    }
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    refreshAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  // Poll GET /api/documents/{id} while any document is still processing.
  // The key changes only when the SET of processing ids changes, so ordinary
  // list refreshes don't restart the timer.
  const processingKey = useMemo(
    () =>
      (documents ?? [])
        .filter((d) => d.status === "processing")
        .map((d) => d.id)
        .sort()
        .join(","),
    [documents]
  );

  useEffect(() => {
    if (!processingKey) return;
    const ids = processingKey.split(",");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (cancelled) return;
      if (!document.hidden) {
        const fresh = await Promise.all(
          ids.map(async (id): Promise<DocumentOut | "gone" | null> => {
            try {
              const res = await fetch(`/api/documents/${id}`);
              if (res.status === 404) return "gone";
              return res.ok ? ((await res.json()) as DocumentOut) : null;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;

        const settled = fresh.some(
          (d) => d === "gone" || (d !== null && d.status !== "processing")
        );
        if (settled) {
          // A document finished (or failed, which refunds its credit): the
          // balances and counts changed too, so reload everything.
          await refreshAll();
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [processingKey, refreshAll]);

  const value = useMemo<DashboardDataContextType>(
    () => ({
      dashboard,
      documents,
      creditBalance: dashboard?.balances.documents ?? null,
      messageBalance: dashboard?.balances.messages ?? null,
      totalDocuments: dashboard?.counts.documents ?? 0,
      loading,
      refreshAll,
    }),
    [dashboard, documents, loading, refreshAll]
  );

  return (
    <DashboardDataContext.Provider value={value}>
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

"use client";

import { useCallback, useRef, useState } from "react";
import { useDashboardData } from "@/contexts/dashboard-data";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import {
  checkFileLocally,
  describeUploadError,
  type Reason,
} from "@/lib/document-errors";
import type { ApiErrorBody } from "@/types/api";

/**
 * A file that is in the browser's hands: waiting, being sent, or refused.
 * Once the server accepts it (202) the item is dropped and the document shows
 * up in the list with the server's own status (processing, ready, failed).
 */
export type UploadItem = {
  key: string;
  name: string;
  size: number;
  phase: "queued" | "uploading" | "rejected";
  reason?: Reason;
  /** True when sending the same file again could work (a network or service problem). */
  retryable?: boolean;
};

/** Codes where the file is fine and the trip failed. */
const TRANSIENT = new Set([
  "NETWORK",
  "STORAGE_UNAVAILABLE",
  "BACKEND_UNAVAILABLE",
  "BACKEND_TIMEOUT",
  "BACKEND_AUTH_FAILED",
]);

let nextKey = 0;

/**
 * Sends files one at a time (each one reserves a credit server-side, and a
 * sequence keeps the "no credits left" answer attached to the right file).
 * `refreshAll()` runs after every attempt: an accepted upload changed the
 * balances, and a rejected one may have (a refund).
 */
export function useUploadQueue() {
  const { refreshAll } = useDashboardData();
  const [items, setItems] = useState<UploadItem[]>([]);
  const files = useRef(new Map<string, File>());
  const pending = useRef<string[]>([]);
  const running = useRef(false);

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }, []);

  const drop = useCallback((key: string) => {
    files.current.delete(key);
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      let key: string | undefined;
      while ((key = pending.current.shift())) {
        const file = files.current.get(key);
        if (!file) continue;
        patch(key, { phase: "uploading", reason: undefined });
        try {
          const body = new FormData();
          body.append("file", file);
          const res = await fetch("/api/documents", { method: "POST", body });
          if (res.ok) {
            await refreshAll();
            drop(key);
          } else {
            const err = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
            patch(key, {
              phase: "rejected",
              reason: describeUploadError(err?.status),
              retryable: TRANSIENT.has(err?.status ?? ""),
            });
            await refreshAll();
          }
        } catch {
          patch(key, {
            phase: "rejected",
            reason: describeUploadError("NETWORK"),
            retryable: true,
          });
        }
      }
    } finally {
      running.current = false;
    }
  }, [drop, patch, refreshAll]);

  const addFiles = useCallback(
    (list: File[]) => {
      const added: UploadItem[] = [];
      for (const file of list) {
        const key = `u${++nextKey}`;
        const problem = checkFileLocally(file, MAX_UPLOAD_BYTES);
        added.push({
          key,
          name: file.name,
          size: file.size,
          phase: problem ? "rejected" : "queued",
          reason: problem ?? undefined,
        });
        if (!problem) {
          files.current.set(key, file);
          pending.current.push(key);
        }
      }
      setItems((prev) => [...added, ...prev]);
      void drain();
    },
    [drain]
  );

  const retry = useCallback(
    (key: string) => {
      if (!files.current.has(key)) return;
      patch(key, { phase: "queued", reason: undefined, retryable: false });
      pending.current.push(key);
      void drain();
    },
    [drain, patch]
  );

  return { items, addFiles, retry, dismiss: drop };
}

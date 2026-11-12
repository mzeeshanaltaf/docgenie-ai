"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Citation } from "@/types/api";

/** What the document viewer is asked to show. */
export type ViewerTarget = {
  documentId: string;
  fileName: string;
  /** 1-based page to open at (PDF, and approximate for DOCX/TXT); null for CSV. */
  page: number | null;
  /**
   * Last page of the cited range (a passage can sit on any page of a chunk that
   * spans two). The PDF viewer looks for the passage across `page..pageEnd`.
   */
  pageEnd: number | null;
  /** Passage to highlight (a citation snippet); empty for none. */
  snippet: string;
  /** Changes on every open so reopening the same target re-runs the highlight. */
  nonce: number;
};

type ViewerContextValue = {
  target: ViewerTarget | null;
  /** Open the viewer at a citation: its document, first page and snippet. */
  openCitation: (c: Citation) => void;
  /** Open a document with no highlight. */
  openDocument: (documentId: string, fileName: string, page?: number | null) => void;
  close: () => void;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ViewerTarget | null>(null);

  const openCitation = useCallback((c: Citation) => {
    setTarget((prev) => ({
      documentId: c.document_id,
      fileName: c.file_name,
      page: c.page_start,
      pageEnd: c.page_end,
      snippet: c.snippet,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);

  const openDocument = useCallback(
    (documentId: string, fileName: string, page: number | null = null) => {
      setTarget((prev) => ({
        documentId,
        fileName,
        page,
        pageEnd: page,
        snippet: "",
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    },
    []
  );

  const close = useCallback(() => setTarget(null), []);

  const value = useMemo(
    () => ({ target, openCitation, openDocument, close }),
    [target, openCitation, openDocument, close]
  );
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used inside <ViewerProvider>");
  return ctx;
}

/** For presentational components that may be shown with no viewer (static replays). */
export function useOptionalViewer(): ViewerContextValue | null {
  return useContext(ViewerContext);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findSnippet, normalise, toSourceRange } from "@/lib/chat/highlight";
import type { ViewerTarget } from "./viewer-context";

// pdfjs touches browser APIs at import time, so it never loads on the server.
const PdfViewer = dynamic(
  () => import("@/components/dashboard/documents/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    ),
  }
);

const contentUrl = (id: string, download = false) =>
  `/api/documents/${id}/content${download ? "?download=true" : ""}`;

type Kind = "pdf" | "txt" | "csv" | "other";

function kindOf(fileName: string): Kind {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "txt" || ext === "md") return "txt";
  if (ext === "csv") return "csv";
  return "other";
}

/** Fetches a document's original as text (TXT and CSV). */
function useDocumentText(documentId: string) {
  const [state, setState] = useState<{ text: string | null; error: boolean; loading: boolean }>({
    text: null,
    error: false,
    loading: true,
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ text: null, error: false, loading: true });
    fetch(contentUrl(documentId), { signal: controller.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => setState({ text, error: false, loading: false }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        void err;
        setState({ text: null, error: true, loading: false });
      });
    return () => controller.abort();
  }, [documentId]);
  return state;
}

/** Plain text with the cited passage marked and scrolled into view. */
function TextView({ target }: { target: ViewerTarget }) {
  const { text, error, loading } = useDocumentText(target.documentId);
  const markRef = useRef<HTMLElement>(null);

  const parts = useMemo(() => {
    if (!text) return null;
    if (!target.snippet) return { before: text, hit: "", after: "" };
    const hay = normalise(text);
    const found = findSnippet(hay, target.snippet);
    if (!found) return { before: text, hit: "", after: "" };
    const r = toSourceRange(hay, found);
    return { before: text.slice(0, r.start), hit: text.slice(r.start, r.end), after: text.slice(r.end) };
  }, [text, target.snippet]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [parts, target.nonce]);

  if (loading) return <Loading />;
  if (error || !parts) return <LoadError />;
  return (
    <pre className="figure min-h-0 flex-1 overflow-auto rounded border border-border bg-muted/20 p-4 text-[0.8125rem] leading-[1.54] whitespace-pre-wrap wrap-break-word">
      {parts.before}
      {parts.hit && (
        <mark ref={markRef} className="cite-highlight">
          {parts.hit}
        </mark>
      )}
      {parts.after}
    </pre>
  );
}

/** Minimal CSV reader (quoted fields, doubled quotes, CRLF). */
function parseCsv(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length <= maxRows; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (rows.length <= maxRows && (field || row.length)) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const CSV_ROWS = 200;

/**
 * A CSV answer comes from a SQL query over the whole table, so there is no
 * single passage to point at: show the table (first rows) and, above it, the
 * query that was run.
 */
function CsvView({ target }: { target: ViewerTarget }) {
  const { text, error, loading } = useDocumentText(target.documentId);
  const rows = useMemo(() => (text ? parseCsv(text, CSV_ROWS) : []), [text]);

  if (loading) return <Loading />;
  if (error || rows.length === 0) return <LoadError />;
  const [head, ...body] = rows;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded border border-border">
      <table className="w-full border-collapse text-body-sm">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="figure w-10 border-b border-rule-strong px-2 py-1.5 text-right font-medium text-muted-foreground">
              #
            </th>
            {head.map((h, i) => (
              <th key={i} className="border-b border-rule-strong px-3 py-1.5 text-left font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="hover:bg-accent">
              <td className="figure border-b border-rule px-2 py-1.5 text-right text-muted-foreground">{i + 1}</td>
              {r.map((c, j) => (
                <td key={j} className="figure border-b border-rule px-3 py-1.5 whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {body.length >= CSV_ROWS && (
        <p className="p-3 text-body-sm text-muted-foreground">
          Showing the first {CSV_ROWS} rows. Download the file for the rest.
        </p>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

function LoadError() {
  return (
    <p className="p-4 text-body-sm text-destructive" role="alert">
      The document could not be loaded. It may have been deleted.
    </p>
  );
}

/**
 * The source viewer a citation opens: the cited document at the cited page with
 * the passage marked (PDF), scrolled to the passage (TXT), or the table plus the
 * query that produced the answer (CSV). Word files have no in-browser preview,
 * so those show the cited passage and a download link.
 */
export function DocumentViewer({
  target,
  onClose,
}: {
  target: ViewerTarget;
  onClose: () => void;
}) {
  const kind = kindOf(target.fileName);
  const isSql = target.snippet.startsWith("SQL:");

  return (
    <section aria-label={`Source: ${target.fileName}`} className="flex h-full min-h-0 flex-col bg-card">
      <header className="flex items-start gap-2 border-b border-rule px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="ds-label">Source</p>
          <h2 className="truncate text-title text-foreground" title={target.fileName}>
            {target.fileName}
          </h2>
          {target.page != null && (
            <p className="figure text-body-sm text-muted-foreground">Cited on page {target.page}</p>
          )}
        </div>
        <Button asChild variant="ghost" size="icon-sm" aria-label="Download original">
          <a href={contentUrl(target.documentId, true)}>
            <Download aria-hidden />
          </a>
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close source">
          <X aria-hidden />
        </Button>
      </header>

      {target.snippet && (kind === "other" || kind === "csv") && (
        <div className="border-b border-rule px-4 py-3">
          <p className="ds-label mb-1">{isSql ? "Query that produced the answer" : "Cited passage"}</p>
          <p className="figure line-clamp-6 text-[0.8125rem] leading-[1.54] break-words text-foreground">
            {isSql ? target.snippet.replace(/^SQL:\s*/, "") : target.snippet}
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {kind === "pdf" && (
          <PdfViewer
            file={contentUrl(target.documentId)}
            initialPage={target.page ?? 1}
            highlight={target.snippet}
            focusKey={target.nonce}
            fill
          />
        )}
        {kind === "txt" && <TextView target={target} />}
        {kind === "csv" && <CsvView target={target} />}
        {kind === "other" && (
          <p className="text-body-sm text-muted-foreground">
            Word documents can&apos;t be previewed in the browser. Download the original to read it in full.
          </p>
        )}
      </div>
    </section>
  );
}

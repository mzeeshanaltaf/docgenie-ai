"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs, type DocumentProps } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findSnippet, normalise } from "@/lib/chat/highlight";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
/** Most pages searched for a cited passage (a chunk spans at most a few). */
const MAX_SCAN_PAGES = 4;

type LoadedPdf = Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0];

/**
 * The page in `first..last` whose text holds the passage best (a full match
 * beats a prefix match), or null if none does. Reads the text content only,
 * nothing is rendered.
 */
async function locatePage(
  pdf: LoadedPdf,
  snippet: string,
  first: number,
  last: number
): Promise<number | null> {
  let best: { page: number; length: number } | null = null;
  for (let p = first; p <= last; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    const hit = findSnippet(normalise(text), snippet);
    if (hit && (!best || hit.end - hit.start > best.length)) {
      best = { page: p, length: hit.end - hit.start };
    }
  }
  return best?.page ?? null;
}

interface PdfViewerProps {
  /**
   * What to load: a same-origin URL (`/api/documents/{id}/content`, streamed,
   * session cookie sent) or the bytes as a Blob. Remount (`key`) for another file.
   */
  file: string | Blob;
  /** 1-based page to show first. Changes of `focusKey` re-apply it. */
  initialPage?: number;
  /**
   * Last page of the cited range. When it is past `initialPage`, the passage is
   * looked up across the range and the page that holds it is opened.
   */
  lastPage?: number;
  /** Passage to mark on the page's text layer (a citation snippet). */
  highlight?: string;
  /** Bump to jump to `initialPage` and re-run the highlight for the same file. */
  focusKey?: number;
  /** Fill the parent's height instead of capping the page area at 60vh. */
  fill?: boolean;
  className?: string;
}

/**
 * Marks the text-layer spans that cover `snippet` and scrolls the first one
 * into view. Works on the span level (pdf.js splits a line into a few spans), so
 * the mark is a little wider than the passage at its edges. Returns whether the
 * passage was found.
 */
function markSnippet(layer: HTMLElement, snippet: string): boolean {
  layer.querySelectorAll(".cite-highlight").forEach((el) => el.classList.remove("cite-highlight"));
  const spans = Array.from(layer.querySelectorAll<HTMLElement>("span")).filter(
    (s) => s.children.length === 0 && (s.textContent ?? "").trim().length > 0
  );
  if (spans.length === 0) return false;

  // Concatenate the page text, remembering which span each character is in.
  let joined = "";
  const owner: number[] = [];
  spans.forEach((s, i) => {
    const t = (s.textContent ?? "") + " ";
    joined += t;
    for (let k = 0; k < t.length; k++) owner.push(i);
  });
  const hay = normalise(joined);
  const hit = findSnippet(hay, snippet);
  if (!hit) return false;

  const first = owner[hay.map[hit.start]];
  const last = owner[hay.map[hit.end - 1]];
  for (let i = first; i <= last; i++) spans[i].classList.add("cite-highlight");
  spans[first].scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

export function PdfViewer({
  file,
  initialPage = 1,
  lastPage,
  highlight = "",
  focusKey = 0,
  fill = false,
  className,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<LoadedPdf | null>(null);
  // The snippet is only marked on the page it was found on (-1: still looking).
  const targetPage = useRef(initialPage);
  const snippetRef = useRef(highlight);
  const pageNow = useRef(pageNumber);
  pageNow.current = pageNumber;

  const markNow = useCallback(() => {
    const snippet = snippetRef.current;
    if (!snippet || pageNow.current !== targetPage.current) return;
    const layer = pageRef.current?.querySelector<HTMLElement>(".react-pdf__Page__textContent");
    if (!layer) return;
    setNotFound(!markSnippet(layer, snippet));
  }, []);

  // A new citation (or the document just loaded): find the page in the cited
  // range that holds the passage, go there and mark it.
  useEffect(() => {
    snippetRef.current = highlight;
    setNotFound(false);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const open = (page: number) => {
      if (cancelled) return;
      targetPage.current = page;
      if (pageNow.current === page) {
        // Same page: the text layer will not re-render, so mark it directly.
        timer = setTimeout(markNow, 50);
      } else {
        setPageNumber(page);
      }
    };

    const last = Math.min(lastPage ?? initialPage, initialPage + MAX_SCAN_PAGES - 1);
    if (!highlight || last <= initialPage) {
      open(initialPage);
    } else {
      targetPage.current = -1; // hold the mark until the page is known
      const pdf = pdfRef.current;
      if (pdf) {
        locatePage(pdf, highlight, initialPage, Math.min(last, pdf.numPages))
          .catch(() => null)
          .then((page) => open(page ?? initialPage));
      } else {
        // Not loaded yet: show the first cited page; this effect re-runs on load.
        setPageNumber(initialPage);
      }
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, numPages]);

  // Measure the available width once — disconnect immediately after the first
  // non-zero reading so PDF content can never trigger re-observation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0) {
        setContainerWidth(w);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = containerWidth > 0 ? Math.round(containerWidth * zoom) : 0;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", fill && "h-full", className)}>
      {/* Toolbar: page navigation + zoom */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {numPages > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={pageNumber <= 1}
                onClick={() => setPageNumber((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="figure">
                {pageNumber} / {numPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={pageNumber >= numPages}
                onClick={() => setPageNumber((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="figure w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {notFound && (
        <p className="text-body-sm text-muted-foreground" role="status">
          The cited passage could not be located on this page. It is shown at the cited page.
        </p>
      )}

      {/* Zero-height sentinel: purely for measuring available width.
          Has no content so it never expands — ResizeObserver stays stable. */}
      <div ref={containerRef} className="w-full h-0" aria-hidden />

      <div
        ref={pageRef}
        className={cn(
          "overflow-auto rounded border border-border bg-muted/20",
          fill ? "min-h-0 flex-1" : "max-h-[60vh]"
        )}
        style={{ width: containerWidth > 0 ? containerWidth : "100%" }}
      >
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {failed && (
          <p className="p-4 text-body-sm text-destructive" role="alert">
            This PDF could not be displayed.
          </p>
        )}
        <Document
          file={file}
          onLoadSuccess={(pdf) => {
            const { numPages } = pdf;
            pdfRef.current = pdf;
            setNumPages(numPages);
            setPageNumber((p) => Math.min(Math.max(1, p), numPages));
            setLoading(false);
          }}
          onLoadError={() => {
            setLoading(false);
            setFailed(true);
          }}
          loading={null}
          error={null}
        >
          {pageWidth > 0 && (
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              renderAnnotationLayer={false}
              renderTextLayer={true}
              onRenderTextLayerSuccess={markNow}
            />
          )}
        </Document>
      </div>
    </div>
  );
}

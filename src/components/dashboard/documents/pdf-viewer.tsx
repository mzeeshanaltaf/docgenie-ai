"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfViewerProps {
  base64: string;
}

export function PdfViewer({ base64 }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);

  const pdfData = `data:application/pdf;base64,${base64}`;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Page navigation */}
      {numPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {pageNumber} of {numPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* PDF canvas */}
      <div className="w-full overflow-auto max-h-[60vh] flex justify-center border border-border rounded bg-muted/20">
        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <Document
          file={pdfData}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setLoading(false);
          }}
          onLoadError={() => setLoading(false)}
          loading={null}
        >
          <Page
            pageNumber={pageNumber}
            width={600}
            renderAnnotationLayer={false}
            renderTextLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}

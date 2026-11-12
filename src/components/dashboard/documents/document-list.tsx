"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  FileSpreadsheet,
  File,
  Trash2,
  Loader2,
  Eye,
  Download,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiErrorBody, DocumentOut } from "@/types/api";

// Lazy-load the PDF viewer to avoid SSR issues with pdfjs-dist
const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

function getFileIcon(mimeType: string) {
  if (mimeType === "text/csv") return FileSpreadsheet;
  if (mimeType === "application/pdf" || mimeType.includes("word"))
    return FileText;
  return File;
}

function formatFileSize(b: number) {
  if (!Number.isFinite(b)) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// TEMPORARY (Phase 8 replaces this with readable messages): turns
// NO_TEXT_FOUND into "no text found".
function failureLabel(code: string | null) {
  return code ? code.toLowerCase().replace(/_/g, " ") : "processing failed";
}

const contentUrl = (id: string, download = false) =>
  `/api/documents/${id}/content${download ? "?download=true" : ""}`;

/** What the preview dialog holds once the original has been fetched. */
type PreviewContent =
  | { kind: "pdf"; blob: Blob }
  | { kind: "text"; text: string }
  | { kind: "none" };

function DocumentPreview({
  doc,
  content,
}: {
  doc: DocumentOut;
  content: PreviewContent;
}) {
  if (content.kind === "pdf") return <PdfViewer file={content.blob} />;

  if (content.kind === "text") {
    return (
      <pre className="overflow-auto max-h-[60vh] text-xs bg-muted rounded p-4 whitespace-pre-wrap wrap-break-word">
        {content.text}
      </pre>
    );
  }

  const ext = doc.file_name.split(".").pop()?.toUpperCase() ?? "File";
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-sm text-muted-foreground">
        Preview not available for {ext} files.
      </p>
    </div>
  );
}

export function DocumentList() {
  const { documents, refreshAll } = useDashboardData();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentOut | null>(null);
  const [previewContent, setPreviewContent] = useState<PreviewContent>({
    kind: "none",
  });
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmDelete(null);

    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        toast.error(err?.message || "Failed to delete document");
        return;
      }

      toast.success("Document deleted");
      await refreshAll();
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeleting(null);
    }
  };

  const handlePreview = async (doc: DocumentOut) => {
    setPreviewing(doc.id);
    setPreviewLoading(true);
    setPreviewDoc(null);

    try {
      // Fetched on demand: the dashboard never loads file bytes.
      const res = await fetch(contentUrl(doc.id));
      if (!res.ok) throw new Error("Failed to load the file");

      let content: PreviewContent = { kind: "none" };
      if (doc.mime_type === "application/pdf") {
        content = { kind: "pdf", blob: await res.blob() };
      } else if (doc.mime_type === "text/csv" || doc.mime_type === "text/plain") {
        content = { kind: "text", text: await res.text() };
      }
      setPreviewContent(content);
      setPreviewDoc(doc);
    } catch {
      toast.error("Failed to load document preview");
      setPreviewing(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewing(null);
    setPreviewContent({ kind: "none" });
  };

  if (!documents || documents.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No documents uploaded yet. Upload your first document above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border rounded-lg border border-border">
        {documents.map((doc) => {
          const Icon = getFileIcon(doc.mime_type);
          return (
            <div
              key={doc.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {doc.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)}
                    {doc.status === "processing" && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Processing…
                      </span>
                    )}
                    {doc.status === "failed" && (
                      <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        Failed: {failureLabel(doc.error_code)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={previewing === doc.id && previewLoading}
                  onClick={() => handlePreview(doc)}
                  title="Preview"
                >
                  {previewing === doc.id && previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={deleting === doc.id}
                  onClick={() =>
                    setConfirmDelete({
                      id: doc.id,
                      name: doc.file_name,
                    })
                  }
                  title="Delete"
                >
                  {deleting === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview dialog */}
      <Dialog
        open={!!previewDoc}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewDoc?.file_name}</DialogTitle>
            <DialogDescription>
              {previewDoc && formatFileSize(previewDoc.file_size)} &middot; {previewDoc?.mime_type}
            </DialogDescription>
          </DialogHeader>
          {previewDoc && (
            <DocumentPreview doc={previewDoc} content={previewContent} />
          )}
          <DialogFooter>
            {previewDoc && (
              <Button variant="outline" className="gap-2" asChild>
                <a href={contentUrl(previewDoc.id, true)}>
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={closePreview}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This will permanently delete &ldquo;{confirmDelete?.name}&rdquo;.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

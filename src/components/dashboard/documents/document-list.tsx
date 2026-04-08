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
} from "lucide-react";
import { toast } from "sonner";
import type { DocumentRecord } from "@/types/n8n";

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

function formatFileSize(bytes: string | number) {
  const b = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(b)) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentPreview({ doc }: { doc: DocumentRecord }) {
  const { mime_type, file_base64, file_name } = doc;

  if (!file_base64) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No preview available.
      </p>
    );
  }

  if (mime_type === "application/pdf") {
    return <PdfViewer base64={file_base64} />;
  }

  if (mime_type === "text/csv" || mime_type === "text/plain") {
    let text = "";
    try {
      text = atob(file_base64);
    } catch {
      return (
        <p className="text-sm text-destructive text-center py-8">
          Failed to decode file content.
        </p>
      );
    }
    return (
      <pre className="overflow-auto max-h-[60vh] text-xs bg-muted rounded p-4 whitespace-pre-wrap wrap-break-word">
        {text}
      </pre>
    );
  }

  // Unsupported preview type
  const ext = file_name.split(".").pop()?.toUpperCase() ?? "File";
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="text-sm text-muted-foreground">
        Preview not available for {ext} files.
      </p>
    </div>
  );
}

function downloadDocument(doc: DocumentRecord) {
  const binary = atob(doc.file_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: doc.mime_type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.file_name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentList() {
  const { documents, refreshAll, loadPreviewDocuments } = useDashboardData();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleDelete = async (fileId: string) => {
    setDeleting(fileId);
    setConfirmDelete(null);

    try {
      const res = await fetch("/api/documents/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_ids: [fileId] }),
      });

      const data = await res.json();

      if (!res.ok || data.success === false) {
        toast.error(data.message || "Failed to delete document");
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

  const handlePreview = async (fileId: string) => {
    setPreviewing(fileId);
    setPreviewLoading(true);
    setPreviewDoc(null);

    try {
      const data = await loadPreviewDocuments();
      const doc = data.find((d) => d.file_id === fileId) ?? null;
      if (!doc) throw new Error("Document not found in preview data");
      setPreviewDoc(doc);
    } catch {
      toast.error("Failed to load document preview");
      setPreviewing(null);
    } finally {
      setPreviewLoading(false);
    }
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
              key={doc.file_id}
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
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={previewing === doc.file_id && previewLoading}
                  onClick={() => handlePreview(doc.file_id)}
                  title="Preview"
                >
                  {previewing === doc.file_id && previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  disabled={deleting === doc.file_id}
                  onClick={() =>
                    setConfirmDelete({
                      id: doc.file_id,
                      name: doc.file_name,
                    })
                  }
                >
                  {deleting === doc.file_id ? (
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
          if (!open) {
            setPreviewDoc(null);
            setPreviewing(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewDoc?.file_name}</DialogTitle>
            <DialogDescription>
              {previewDoc && formatFileSize(previewDoc.file_size)} &middot; {previewDoc?.mime_type}
            </DialogDescription>
          </DialogHeader>
          {previewDoc && <DocumentPreview doc={previewDoc} />}
          <DialogFooter>
            {previewDoc && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => downloadDocument(previewDoc)}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
            <Button variant="outline" onClick={() => { setPreviewDoc(null); setPreviewing(null); }}>
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

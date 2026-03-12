"use client";

import { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

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

export function DocumentList() {
  const { documents, refreshDocuments, refreshCredits, refreshAll } =
    useDashboardData();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
      await Promise.all([refreshDocuments(), refreshCredits(), refreshAll()]);
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeleting(null);
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
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
          );
        })}
      </div>

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

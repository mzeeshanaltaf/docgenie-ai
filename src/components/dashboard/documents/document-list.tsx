"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2, RotateCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useDashboardData } from "@/contexts/dashboard-data";
import { useViewer } from "@/components/chat/viewer-context";
import { Button } from "@/components/ui/button";
import { StatusTag, Tag } from "@/components/app/tag";
import { describeIngestionFailure } from "@/lib/document-errors";
import { formatBytes, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApiErrorBody, DocumentOut } from "@/types/api";
import type { UploadItem } from "./use-upload-queue";

const contentUrl = (id: string) => `/api/documents/${id}/content?download=true`;

const fileType = (name: string) => name.split(".").pop()?.toUpperCase() ?? "FILE";

/** Column template once the list itself is 42rem wide (a container query, so the docked viewer is accounted for): name | pages | size | added | status | actions. */
const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 @2xl:grid-cols-[minmax(0,1fr)_4rem_5rem_5rem_7.5rem_6.5rem] @2xl:items-center";

const touch = "@max-2xl:size-11";

function HeaderRow() {
  return (
    <div
      aria-hidden
      className={cn(GRID, "ds-label hidden border-b border-rule-strong bg-muted px-3 py-2 @2xl:grid")}
    >
      <span>Name</span>
      <span className="text-right">Pages</span>
      <span className="text-right">Size</span>
      <span className="text-right">Added</span>
      <span>Status</span>
      <span />
    </div>
  );
}

function UploadRow({
  item,
  onRetry,
  onDismiss,
}: {
  item: UploadItem;
  onRetry: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const rejected = item.phase === "rejected";
  return (
    <li className={cn(GRID, "px-3 py-3")}>
      <div className="min-w-0">
        <p className="truncate text-body-sm font-medium">{item.name}</p>
        {rejected && item.reason ? (
          <p className="mt-0.5 text-caption text-muted-foreground">
            {item.reason.title}. {item.reason.detail}
          </p>
        ) : (
          <p className="mt-0.5 text-caption text-muted-foreground">
            {item.phase === "queued" ? "Waiting to upload" : "Sending the file"}
          </p>
        )}
      </div>
      <span className="figure hidden text-right text-body-sm text-muted-foreground @2xl:block">{"–"}</span>
      <span className="figure hidden text-right text-body-sm @2xl:block">{formatBytes(item.size)}</span>
      <span className="hidden @2xl:block" />
      <div className="@max-2xl:col-start-2 @max-2xl:row-start-1">
        <StatusTag status={rejected ? "rejected" : "uploading"} />
      </div>
      <div className="flex justify-end gap-0.5 @max-2xl:col-span-2">
        {rejected ? (
          <>
            {item.retryable ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={touch}
                onClick={() => onRetry(item.key)}
                aria-label={`Retry ${item.name}`}
              >
                <RotateCw aria-hidden />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={touch}
              onClick={() => onDismiss(item.key)}
              aria-label={`Dismiss ${item.name}`}
            >
              <X aria-hidden />
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function DocumentRow({
  doc,
  deleting,
  confirming,
  onOpen,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  doc: DocumentOut;
  deleting: boolean;
  confirming: boolean;
  onOpen: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const ready = doc.status === "ready";
  const failure = doc.status === "failed" ? describeIngestionFailure(doc.error_code) : null;
  const pages = doc.num_pages != null ? String(doc.num_pages) : "–";
  const rows = doc.csv_schema?.row_count;

  if (confirming) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-muted px-3 py-3">
        <p className="min-w-0 text-body-sm">
          Delete <span className="font-medium break-all">{doc.file_name}</span>? The file and its indexed text are
          removed. The credit is not returned.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancelDelete} autoFocus>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 aria-hidden /> Delete
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className={cn(GRID, "px-3 py-3 transition-colors hover:bg-accent", deleting && "opacity-50")}>
      <div className="min-w-0">
        <p className="truncate text-body-sm font-medium" title={doc.file_name}>
          {doc.file_name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Tag>{fileType(doc.file_name)}</Tag>
          {doc.ocr_used ? <Tag title="Scanned pages were read with OCR">OCR</Tag> : null}
          {rows != null ? <span className="figure text-caption text-muted-foreground">{rows} rows</span> : null}
          <span className="figure text-caption text-muted-foreground @2xl:hidden">
            {doc.num_pages != null ? `${doc.num_pages} ${doc.num_pages === 1 ? "page" : "pages"} · ` : ""}
            {formatBytes(doc.file_size)} · {formatDay(doc.created_at)}
          </span>
        </div>
        {failure ? (
          <p className="mt-1.5 text-caption text-muted-foreground">
            {failure.title}. {failure.detail} The credit was refunded.
          </p>
        ) : null}
      </div>

      <span className="figure hidden text-right text-body-sm @2xl:block">{pages}</span>
      <span className="figure hidden text-right text-body-sm @2xl:block">{formatBytes(doc.file_size)}</span>
      <span className="figure hidden text-right text-body-sm text-muted-foreground @2xl:block">
        {formatDay(doc.created_at)}
      </span>
      <div className="@max-2xl:col-start-2 @max-2xl:row-start-1">
        <StatusTag status={doc.status} />
      </div>

      <div className="flex justify-end gap-0.5 @max-2xl:col-span-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={touch}
          disabled={!ready}
          onClick={onOpen}
          aria-label={`Open ${doc.file_name}`}
          title={ready ? "Open" : "Available when the document is ready"}
        >
          <Eye aria-hidden />
        </Button>
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className={cn(touch, !ready && "pointer-events-none opacity-50")}
        >
          <a
            href={ready ? contentUrl(doc.id) : undefined}
            aria-disabled={!ready}
            aria-label={`Download ${doc.file_name}`}
            tabIndex={ready ? undefined : -1}
            title="Download"
          >
            <Download aria-hidden />
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(touch, "hover:text-destructive")}
          disabled={deleting}
          onClick={onAskDelete}
          aria-label={`Delete ${doc.file_name}`}
          title="Delete"
        >
          {deleting ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
        </Button>
      </div>
    </li>
  );
}

export function DocumentList({
  uploads,
  onRetryUpload,
  onDismissUpload,
}: {
  uploads: UploadItem[];
  onRetryUpload: (key: string) => void;
  onDismissUpload: (key: string) => void;
}) {
  const { documents, refreshAll } = useDashboardData();
  const { openDocument, target, close } = useViewer();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Say so when a document settles: the row changes, but a toast is announced too.
  const lastStatus = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!documents) return;
    const before = lastStatus.current;
    if (before) {
      for (const d of documents) {
        if (before.get(d.id) !== "processing") continue;
        if (d.status === "ready") toast.success(`${d.file_name} is ready`);
        if (d.status === "failed") {
          toast.error(`${d.file_name}: ${describeIngestionFailure(d.error_code).title}`);
        }
      }
    }
    lastStatus.current = new Map(documents.map((d) => [d.id, d.status]));
  }, [documents]);

  async function handleDelete(doc: DocumentOut) {
    setDeleting(doc.id);
    setConfirming(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        toast.error(err?.message || "The document could not be deleted. Try again.");
        return;
      }
      if (target?.documentId === doc.id) close();
      toast.success("Document deleted");
      await refreshAll();
    } catch {
      toast.error("The document could not be deleted. Check your connection and try again.");
    } finally {
      setDeleting(null);
    }
  }

  const list = documents ?? [];

  if (list.length === 0 && uploads.length === 0) {
    return (
      <div className="border-t border-rule py-8">
        <p className="text-body font-medium">No documents yet</p>
        <p className="measure mt-1 text-body-sm text-muted-foreground">
          Drop a file above to add your first one. Once its status reads Ready, ask about it in chat.
        </p>
      </div>
    );
  }

  return (
    <div className="@container overflow-hidden rounded-lg border border-border bg-card">
      <HeaderRow />
      <ul className="divide-y divide-rule">
        {uploads.map((item) => (
          <UploadRow key={item.key} item={item} onRetry={onRetryUpload} onDismiss={onDismissUpload} />
        ))}
        {list.map((doc) => (
          <DocumentRow
            key={doc.id}
            doc={doc}
            deleting={deleting === doc.id}
            confirming={confirming === doc.id}
            onOpen={() => openDocument(doc.id, doc.file_name)}
            onAskDelete={() => setConfirming(doc.id)}
            onCancelDelete={() => setConfirming(null)}
            onDelete={() => handleDelete(doc)}
          />
        ))}
      </ul>
    </div>
  );
}

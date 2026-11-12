import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/types/api";

/** Small mono caption on a wash: document type, OCR marker, status word. Never a pill. */
export function Tag({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "ds-label inline-flex w-fit shrink-0 items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 whitespace-nowrap [&>svg]:size-3",
        className
      )}
    >
      {children}
    </span>
  );
}

/** What a row in the document list can be: a server status, or an upload still in the browser. */
export type RowStatus = DocumentStatus | "uploading" | "rejected";

const STATUS: Record<RowStatus, { word: string; icon: React.ReactNode }> = {
  uploading: {
    word: "Uploading",
    icon: <Upload aria-hidden className="text-muted-foreground" />,
  },
  processing: {
    word: "Processing",
    icon: <Loader2 aria-hidden className="animate-spin text-muted-foreground" />,
  },
  ready: { word: "Ready", icon: <CheckCircle2 aria-hidden className="text-success" /> },
  failed: { word: "Failed", icon: <AlertCircle aria-hidden className="text-destructive" /> },
  rejected: { word: "Rejected", icon: <AlertCircle aria-hidden className="text-destructive" /> },
};

/** Status word with a colored mark. The word always carries the meaning, color only the mark. */
export function StatusTag({ status, className }: { status: RowStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Tag className={className}>
      {s.icon}
      {s.word}
    </Tag>
  );
}

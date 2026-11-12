"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_MB, MAX_UPLOAD_PAGES } from "@/lib/constants";

/**
 * The drop zone. It only collects files; sending and per-file status live in
 * `useUploadQueue` and the list below, so every file has one row from the
 * moment it is chosen. A single control (a real button) so the keyboard path is
 * the same as the pointer path.
 */
export function DocumentUpload({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = Array.from(e.dataTransfer.files);
        if (dropped.length) onFiles(dropped);
      }}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full items-center gap-4 rounded-lg border border-dashed px-5 py-6 text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          dragOver
            ? "border-brand bg-brand-subtle"
            : "border-rule-strong hover:bg-accent"
        )}
      >
        <Upload aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-body font-medium">
            Drop files here, or <span className="text-brand underline underline-offset-4">choose files</span>
          </span>
          <span className="mt-0.5 block text-body-sm text-muted-foreground">
            PDF, DOCX, TXT or CSV, up to <span className="figure">{MAX_UPLOAD_MB}</span> MB and{" "}
            <span className="figure">{MAX_UPLOAD_PAGES}</span> pages each
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.csv"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose documents to upload"
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          if (chosen.length) onFiles(chosen);
          e.target.value = "";
        }}
      />
    </div>
  );
}

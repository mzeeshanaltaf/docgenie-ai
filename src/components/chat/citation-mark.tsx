"use client";

import { cn } from "@/lib/utils";
import { pageLabel } from "@/lib/chat/citations";
import type { Citation } from "@/types/api";

/**
 * The citation mark (DESIGN.md, Components): label type, vermilion on vermilion
 * tint, 1px vermilion border, 2px radius. A button; activating it opens the
 * source. Used inline in an answer (`3`) and in the sources row (`3 contract.pdf p.14`).
 */
export function CitationMark({
  citation,
  onOpen,
  className,
}: {
  citation: Citation;
  onOpen?: (c: Citation) => void;
  className?: string;
}) {
  const page = pageLabel(citation);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(citation)}
      title={`${citation.file_name}${page ? `, ${page}` : ""}`}
      aria-label={`Source ${citation.index}: ${citation.file_name}${page ? `, ${page}` : ""}`}
      className={cn(
        "figure mx-0.5 inline-flex h-[1.15em] min-w-[1.6em] translate-y-[-0.1em] items-center justify-center rounded-xs border border-brand/40 bg-brand-subtle px-1 align-baseline text-[0.6875rem] leading-none font-medium text-brand",
        "cursor-pointer transition-colors hover:border-brand focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className
      )}
    >
      {citation.index}
    </button>
  );
}

/** A source in the row under an answer: the numbered mark, the file name and the page. */
export function SourceChip({
  citation,
  onOpen,
}: {
  citation: Citation;
  onOpen?: (c: Citation) => void;
}) {
  const page = pageLabel(citation);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(citation)}
      className="group flex min-h-8 max-w-full items-center gap-2 rounded-md border border-rule px-2 py-1 text-left text-body-sm transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="figure inline-flex h-[1.15rem] min-w-[1.4rem] shrink-0 items-center justify-center rounded-xs border border-brand/40 bg-brand-subtle px-1 text-[0.6875rem] font-medium text-brand group-hover:border-brand">
        {citation.index}
      </span>
      <span className="truncate text-foreground">{citation.file_name}</span>
      {page && <span className="figure shrink-0 text-muted-foreground">{page}</span>}
    </button>
  );
}

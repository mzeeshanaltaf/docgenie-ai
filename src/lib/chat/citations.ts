import type { SourceMessagePart } from "@assistant-ui/react";
import type { Citation } from "@/types/api";

/**
 * A citation travels through assistant-ui as a `source` part. The part type has
 * no fields for a page range or a snippet, so those ride in `providerMetadata`
 * under this key (see `sourceFromCitation` / `citationFromSource`).
 */
const NS = "docgenie";

/** Mime type used for the part. The real type is resolved by the viewer from the file name. */
const MEDIA_TYPE = "application/octet-stream";

export function sourceFromCitation(c: Citation): SourceMessagePart {
  return {
    type: "source",
    sourceType: "document",
    id: String(c.index),
    title: c.file_name,
    filename: c.file_name,
    mediaType: MEDIA_TYPE,
    providerMetadata: {
      [NS]: {
        index: c.index,
        document_id: c.document_id,
        file_name: c.file_name,
        page_start: c.page_start,
        page_end: c.page_end,
        snippet: c.snippet,
      },
    },
  };
}

/** Reads a citation back out of a `source` part; null for any other source. */
export function citationFromSource(part: {
  type: string;
  providerMetadata?: unknown;
}): Citation | null {
  if (part.type !== "source") return null;
  const meta = (part.providerMetadata as Record<string, unknown> | undefined)?.[NS];
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  if (typeof m.index !== "number" || typeof m.document_id !== "string") return null;
  return {
    index: m.index,
    document_id: m.document_id,
    file_name: typeof m.file_name === "string" ? m.file_name : "document",
    page_start: typeof m.page_start === "number" ? m.page_start : null,
    page_end: typeof m.page_end === "number" ? m.page_end : null,
    snippet: typeof m.snippet === "string" ? m.snippet : "",
  };
}

/** "p.14" or "pp.14-15"; null for documents without pages (CSV). */
export function pageLabel(c: Pick<Citation, "page_start" | "page_end">): string | null {
  if (c.page_start == null) return null;
  if (c.page_end != null && c.page_end !== c.page_start) {
    return `pp.${c.page_start}-${c.page_end}`;
  }
  return `p.${c.page_start}`;
}

/**
 * The model sometimes writes arithmetic as inline LaTeX (`\( (2{,}100 - 2{,}000)
 * \div 2{,}000 \times 100 = 5\% \)`), which Markdown would show as backslashes
 * and braces. There is no math renderer in the chat, so the common inline forms
 * are turned into plain text. (The proper fix is a prompt line telling the model
 * to write math in plain text; see the Phase 7 handoff.)
 */
export function plainMath(text: string): string {
  if (!text.includes("\\")) return text;
  return text
    .replace(/\\\(\s*/g, "")
    .replace(/\s*\\\)/g, "")
    .replace(/\{,\}/g, ",")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\cdot/g, "·")
    .replace(/\\approx/g, "≈")
    .replace(/\\le(q)?\b/g, "≤")
    .replace(/\\ge(q)?\b/g, "≥")
    .replace(/\\%/g, "%")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1 / $2)");
}

/**
 * Turns `[3]` markers into `#cite-3` links so the markdown renderer can draw a
 * citation mark in their place. A marker with no matching citation is removed
 * (the stream contract says to link or strip). While the answer is still
 * streaming, a trailing `[` or `[1` is held back so a half-written marker never
 * flashes on screen.
 */
export function linkCitationMarkers(
  text: string,
  known: ReadonlySet<number>,
  streaming: boolean
): string {
  let t = text;
  if (streaming) t = t.replace(/\[\d*$/, "");
  return t.replace(/\[(\d{1,3})\](?!\()/g, (_m, n: string) =>
    known.has(Number(n)) ? `[${n}](#cite-${n})` : ""
  );
}

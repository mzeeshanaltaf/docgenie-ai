import { MAX_UPLOAD_MB, MAX_UPLOAD_PAGES } from "@/lib/constants";

/**
 * The one place that turns backend error codes into words a user can act on.
 *
 * Two families, because they arrive differently:
 * - Ingestion failures: `documents.error_code` on a document that ended up
 *   `failed` after the upload was accepted (backend `IngestionErrorCode`). The
 *   credit for such a document is always refunded by the backend.
 * - Upload rejections: the `status` of an error body from `POST /api/documents`
 *   (backend `ErrorCode`, plus the proxy's own codes). Nothing was charged.
 */

export type Reason = {
  /** What happened, a few words. */
  title: string;
  /** What to do about it, one sentence. */
  detail: string;
};

const INGESTION: Record<string, Reason> = {
  NO_TEXT_FOUND: {
    title: "No readable text found",
    detail: "The file has no text, even after scanning its pages. Try a clearer copy.",
  },
  PARSE_FAILED: {
    title: "The file could not be read",
    detail: "It may be damaged or password protected. Export it again and retry.",
  },
  OCR_FAILED: {
    title: "Scanning the pages failed",
    detail: "The text recognition step did not finish. Upload it again in a minute.",
  },
  EMBEDDING_FAILED: {
    title: "Indexing failed",
    detail: "The text was read but could not be indexed. Upload it again in a minute.",
  },
  STORAGE_FAILED: {
    title: "The file could not be stored",
    detail: "Upload it again.",
  },
  TEXT_TOO_LARGE: {
    title: "Too much text to index",
    detail: "Split the file into smaller parts and upload them separately.",
  },
  PROCESSING_INTERRUPTED: {
    title: "Processing was interrupted",
    detail: "The service restarted while reading the file. Upload it again.",
  },
  INTERNAL_ERROR: {
    title: "Something went wrong",
    detail: "Upload it again. If it keeps failing, use Help & Support.",
  },
};

/** Reason for a document whose status is `failed`. Unknown or missing codes get the generic text. */
export function describeIngestionFailure(code: string | null | undefined): Reason {
  return (code && INGESTION[code]) || INGESTION.INTERNAL_ERROR;
}

const UNAVAILABLE: Reason = {
  title: "Service unavailable",
  detail: "Try again in a moment. Nothing was charged.",
};

const UPLOAD: Record<string, Reason> = {
  FILE_TOO_LARGE: {
    title: `Over ${MAX_UPLOAD_MB} MB`,
    detail: `Files can be up to ${MAX_UPLOAD_MB} MB. Compress it or split it into parts.`,
  },
  PAGE_LIMIT_EXCEEDED: {
    title: `More than ${MAX_UPLOAD_PAGES} pages`,
    detail: `Documents can have up to ${MAX_UPLOAD_PAGES} pages. Split it into parts.`,
  },
  ROWS_LIMIT_EXCEEDED: {
    title: "Too many rows",
    detail: "Split the CSV into smaller files.",
  },
  UNSUPPORTED_TYPE: {
    title: "Unsupported file type",
    detail: "Use a PDF, DOCX, TXT or CSV file.",
  },
  DUPLICATE_DOCUMENT: {
    title: "Already in your library",
    detail: "A document with the same content is already uploaded.",
  },
  INSUFFICIENT_CREDITS: {
    title: "No document credits left",
    detail: "Each upload uses one credit.",
  },
  VALIDATION_ERROR: {
    title: "The upload was not understood",
    detail: "Choose the file again.",
  },
  STORAGE_UNAVAILABLE: UNAVAILABLE,
  BACKEND_UNAVAILABLE: UNAVAILABLE,
  BACKEND_TIMEOUT: UNAVAILABLE,
  BACKEND_AUTH_FAILED: UNAVAILABLE,
  UNAUTHORIZED: {
    title: "You are signed out",
    detail: "Sign in again, then retry.",
  },
  NETWORK: {
    title: "Could not reach the server",
    detail: "Check your connection and try again. Nothing was charged.",
  },
};

/** Reason for an upload the server (or the browser) refused. */
export function describeUploadError(code: string | null | undefined): Reason {
  return (
    (code && UPLOAD[code]) || {
      title: "Upload failed",
      detail: "Try again. If it keeps failing, use Help & Support.",
    }
  );
}

/** Same checks the backend makes, run before sending so a bad file costs no round trip. */
export function checkFileLocally(file: File, maxBytes: number): Reason | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["pdf", "docx", "txt", "csv"].includes(ext)) return UPLOAD.UNSUPPORTED_TYPE;
  if (file.size > maxBytes) return UPLOAD.FILE_TOO_LARGE;
  if (file.size === 0) return { title: "The file is empty", detail: "Choose a file with content." };
  return null;
}

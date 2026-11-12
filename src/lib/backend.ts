/**
 * Client for the private FastAPI backend (backend/).
 *
 * Only Next.js server code (route handlers, Better Auth hooks) may import this
 * file: it reads server-only env vars and attaches the internal credentials.
 * The browser never sees the backend URL, the key or the user-id header.
 *
 *   BACKEND_API_URL   base URL of the FastAPI service, no trailing slash
 *   INTERNAL_API_KEY  shared secret, sent as X-Internal-Key
 *
 * Every call adds `X-Internal-Key`; calls made on behalf of a user also add
 * `X-User-Id` (never put the user id in a body or query string).
 */

import type { ApiErrorBody } from "@/types/api";

export type BackendRequest = {
  /** Better Auth user id. Omit only for routes that carry the id in the path. */
  userId?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: HeadersInit;
  /** A string (JSON) or FormData. For FormData never set Content-Type: fetch adds the boundary. */
  body?: BodyInit | null;
  /** Forward the browser's abort so the backend can cancel work for a gone client. */
  signal?: AbortSignal;
  /** Whole-call timeout for backendFetch (default 30 s). Ignored by backendStream. */
  timeoutMs?: number;
};

/** The backend could not be reached, or this app is misconfigured. */
export class BackendUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BackendUnavailableError";
  }
}

/** The backend answered with a non-2xx status. */
export class BackendHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Partial<ApiErrorBody> | null
  ) {
    super(body?.message ?? `Backend returned ${status}`);
    this.name = "BackendHttpError";
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

function config(): { baseUrl: string; key: string } {
  const baseUrl = process.env.BACKEND_API_URL;
  const key = process.env.INTERNAL_API_KEY;
  if (!baseUrl) {
    throw new BackendUnavailableError("BACKEND_API_URL is not set.");
  }
  if (!key) {
    throw new BackendUnavailableError("INTERNAL_API_KEY is not set.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), key };
}

function send(
  path: string,
  req: BackendRequest,
  signal: AbortSignal | undefined
): Promise<Response> {
  const { baseUrl, key } = config();
  const headers = new Headers(req.headers);
  headers.set("X-Internal-Key", key);
  if (req.userId) headers.set("X-User-Id", req.userId);

  return fetch(`${baseUrl}${path}`, {
    method: req.method ?? "GET",
    headers,
    body: req.body ?? undefined,
    signal,
    cache: "no-store",
  }).catch((cause: unknown) => {
    // An abort (caller left) or our own timeout is not an outage: let it through as-is.
    if (
      cause instanceof DOMException &&
      (cause.name === "AbortError" || cause.name === "TimeoutError")
    ) {
      throw cause;
    }
    throw new BackendUnavailableError("Could not reach the backend.", { cause });
  });
}

/**
 * Call the backend and return the raw Response (any status). For short
 * request/response calls: it gives up after `timeoutMs`.
 */
export function backendFetch(
  path: string,
  req: BackendRequest = {}
): Promise<Response> {
  const timeout = AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  return send(path, req, signal);
}

/**
 * Like backendFetch, but with no timeout, for long or large bodies that are
 * piped to the browser: the chat SSE stream, file downloads, the export zip.
 * Pass `signal: request.signal` so a closed tab cancels the backend run.
 */
export function backendStream(
  path: string,
  req: BackendRequest = {}
): Promise<Response> {
  return send(path, req, req.signal);
}

/** Call the backend and parse a JSON body. Throws BackendHttpError on non-2xx. */
export async function backendJson<T>(
  path: string,
  req: BackendRequest = {}
): Promise<T> {
  const res = await backendFetch(path, req);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
    throw new BackendHttpError(res.status, body);
  }
  return (await res.json()) as T;
}

// ─── Helpers for route handlers ─────────────────────────────────────────────

export function errorResponse(
  status: number,
  code: string,
  message: string
): Response {
  const body: ApiErrorBody = { success: false, status: code, message };
  return Response.json(body, { status });
}

export function unauthorized(): Response {
  return errorResponse(401, "UNAUTHORIZED", "Please sign in.");
}

/**
 * The browser's JSON body, passed to the backend as-is (the backend validates it).
 * Returns `null` when the request has no body.
 */
export async function jsonBodyOf(
  req: Request
): Promise<Pick<BackendRequest, "body" | "headers"> | null> {
  const text = await req.text();
  if (!text) return null;
  return { body: text, headers: { "Content-Type": "application/json" } };
}

/** Response headers that are safe and useful to pass from the backend to the browser. */
const PASS_HEADERS = [
  "content-type",
  "content-disposition",
  "content-length",
  "cache-control",
] as const;

/**
 * Turn a backend Response into the Response sent to the browser: same status,
 * same body (streamed, not buffered), a few headers.
 *
 * A backend 401 means THIS APP is misconfigured (wrong internal key), not that
 * the user is signed out, so it is reported as a 502; the browser treating it
 * as a logged-out user would be misleading.
 */
export function toClientResponse(res: Response): Response {
  if (res.status === 401) {
    console.error("[backend] rejected the internal credentials (401). Check INTERNAL_API_KEY.");
    void res.body?.cancel();
    return errorResponse(502, "BACKEND_AUTH_FAILED", "The service is misconfigured. Please try again later.");
  }
  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  const noBody = res.status === 204 || res.status === 205 || res.status === 304;
  return new Response(noBody ? null : res.body, {
    status: res.status,
    headers,
  });
}

/** What the browser gets when the backend cannot be reached. */
export function unavailableResponse(err: unknown): Response {
  console.error("[backend] unavailable:", err);
  return errorResponse(
    502,
    "BACKEND_UNAVAILABLE",
    "The service is temporarily unavailable. Please try again."
  );
}

/**
 * The whole thin-proxy step: call the backend as `userId` and relay the answer.
 * Use `stream: true` for large or long bodies (downloads, export, SSE).
 */
export async function forward(
  path: string,
  req: BackendRequest & { stream?: boolean }
): Promise<Response> {
  try {
    const res = req.stream
      ? await backendStream(path, req)
      : await backendFetch(path, req);
    return toClientResponse(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Browser went away; nobody is listening for the answer.
      return new Response(null, { status: 499 });
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return errorResponse(504, "BACKEND_TIMEOUT", "The service took too long to respond.");
    }
    return unavailableResponse(err);
  }
}

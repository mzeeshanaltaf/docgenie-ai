import { useSyncExternalStore } from "react";
import type { SessionOut } from "@/types/api";

/**
 * Small client-side cache of what the thread list adapter and the chat adapter
 * both need to know about sessions, outside assistant-ui's own state:
 *
 * - `selections`: the document selection per session (`null` = all documents),
 *   seeded from `GET /api/sessions` and updated by `PATCH`.
 * - `drafts`: the selection chosen for a chat that does not exist on the server
 *   yet. The first message creates the session, so the draft travels with it as
 *   `document_ids` and is then moved to `selections`.
 * - `titles`: titles that arrived on the stream (`session.title`), which the
 *   adapter's `generateTitle` waits for.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let version = 0;

const selections = new Map<string, string[] | null>();
const drafts = new Map<string, string[] | null>();
const titles = new Map<string, string>();
const titleWaiters = new Map<string, Set<(title: string) => void>>();

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeSessionStore(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberSessions(sessions: SessionOut[]) {
  for (const s of sessions) selections.set(s.id, s.document_ids);
  emit();
}

export function rememberSession(s: SessionOut) {
  selections.set(s.id, s.document_ids);
  emit();
}

export function forgetSession(id: string) {
  selections.delete(id);
  drafts.delete(id);
  titles.delete(id);
  emit();
}

export function getSelection(remoteId: string | undefined, localId: string): string[] | null {
  if (remoteId && selections.has(remoteId)) return selections.get(remoteId) ?? null;
  return drafts.get(localId) ?? null;
}

export function setSelection(
  remoteId: string | undefined,
  localId: string,
  ids: string[] | null
) {
  if (remoteId) selections.set(remoteId, ids);
  else drafts.set(localId, ids);
  emit();
}

/**
 * Called when a draft chat is about to send its first message. Returns the
 * selection to send with it (undefined = nothing chosen, keep the default of all
 * documents) and records it against the new session id.
 */
export function adoptDraft(localId: string, remoteId: string): string[] | undefined {
  const draft = drafts.get(localId);
  drafts.delete(localId);
  if (draft && draft.length > 0) {
    selections.set(remoteId, draft);
    emit();
    return draft;
  }
  selections.set(remoteId, null);
  emit();
  return undefined;
}

/** Re-reads on every store change; use inside a component. */
export function useSessionSelection(remoteId: string | undefined, localId: string) {
  // The version number is the snapshot: it changes exactly when a map does.
  useSyncExternalStore(subscribeSessionStore, () => version, () => 0);
  return getSelection(remoteId, localId);
}

export function publishTitle(sessionId: string, title: string) {
  titles.set(sessionId, title);
  titleWaiters.get(sessionId)?.forEach((fn) => fn(title));
  titleWaiters.delete(sessionId);
}

/** Resolves with the title once the stream delivers it, or null after `timeoutMs`. */
export function waitForTitle(sessionId: string, timeoutMs: number): Promise<string | null> {
  const known = titles.get(sessionId);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const waiters = titleWaiters.get(sessionId) ?? new Set();
    const done = (t: string) => {
      clearTimeout(timer);
      resolve(t);
    };
    const timer = setTimeout(() => {
      waiters.delete(done);
      resolve(null);
    }, timeoutMs);
    waiters.add(done);
    titleWaiters.set(sessionId, waiters);
  });
}

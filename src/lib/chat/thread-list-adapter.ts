import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import type { SessionListOut, SessionOut } from "@/types/api";
import {
  forgetSession,
  rememberSession,
  rememberSessions,
  waitForTitle,
} from "./session-store";

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed (${res.status})`);
  return res;
}

const toMetadata = (s: SessionOut) => ({
  status: "regular" as const,
  remoteId: s.id,
  title: s.title ?? undefined,
  lastMessageAt: new Date(s.updated_at),
});

async function listSessions(): Promise<SessionOut[]> {
  const res = await request("/api/sessions");
  const data = (await res.json()) as SessionListOut;
  rememberSessions(data.sessions);
  return data.sessions;
}

/**
 * Chats are the backend's sessions. A new chat has no server record until its
 * first message (the backend upserts it), so `initialize` only hands out a
 * client-generated UUID and makes no request.
 */
export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const sessions = await listSessions();
    return { threads: sessions.map(toMetadata) };
  },

  async initialize() {
    return { remoteId: crypto.randomUUID(), externalId: undefined };
  },

  async rename(remoteId, title) {
    const res = await request(`/api/sessions/${remoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    rememberSession((await res.json()) as SessionOut);
  },

  // Sessions cannot be archived; the UI offers rename and delete only.
  async archive() {},
  async unarchive() {},

  async delete(remoteId) {
    await request(`/api/sessions/${remoteId}`, { method: "DELETE" });
    forgetSession(remoteId);
  },

  async fetch(remoteId) {
    const found = (await listSessions()).find((s) => s.id === remoteId);
    if (!found) throw new Error("Session not found");
    return toMetadata(found);
  },

  /**
   * The backend titles the chat after its first answer and sends the title as
   * the stream's last event, so there is nothing to generate here: wait for it
   * (or read it from the list if the stream was already gone) and hand it back.
   */
  async generateTitle(remoteId) {
    return createAssistantStream(async (controller) => {
      let title = await waitForTitle(remoteId, 20_000);
      if (!title) {
        const found = (await listSessions().catch(() => [])).find((s) => s.id === remoteId);
        title = found?.title ?? null;
      }
      if (title) controller.appendText(title);
    });
  },
};

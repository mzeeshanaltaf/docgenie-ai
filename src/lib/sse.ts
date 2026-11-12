import type { ChatStreamEvent } from "@/types/api";

/**
 * Parse a `text/event-stream` response body into typed chat events.
 *
 * The backend sends only `event:` + `data:` (one line of JSON) per frame, so
 * this is a deliberately small parser: frames end at a blank line, comments
 * (`:`) and unknown fields are ignored. Contract: backend/docs/chat-stream.md.
 */
export async function* readChatStream(
  res: Response
): AsyncGenerator<ChatStreamEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Normalise CRLF, then split off every complete frame.
      buffer = buffer.replace(/\r\n/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
      }
    }
    const tail = parseFrame(buffer.trim());
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): ChatStreamEvent | null {
  let event = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!event || data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) } as ChatStreamEvent;
  } catch {
    return null; // a malformed frame must not kill the whole stream
  }
}

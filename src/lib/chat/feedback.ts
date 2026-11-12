import type { FeedbackAdapter } from "@assistant-ui/react";
import { toast } from "sonner";
import type { FeedbackIn } from "@/types/api";
import { readCustom } from "./convert";

export const DISLIKE_REASONS = [
  { id: "inaccurate", label: "Inaccurate" },
  { id: "not_in_my_documents", label: "Not in my documents" },
  { id: "incomplete", label: "Incomplete" },
  { id: "too_slow", label: "Too slow" },
  { id: "other", label: "Other" },
] as const;

export type DislikeReason = (typeof DISLIKE_REASONS)[number]["id"];

/**
 * The runtime's feedback call only carries `type` and `comment`, but a dislike
 * also has a reason chip. The popover parks the reason here, keyed by the
 * message's runtime id, right before it submits; the adapter picks it up.
 */
const pendingReasons = new Map<string, DislikeReason>();

export function stageDislikeReason(messageId: string, reason: DislikeReason | null) {
  if (reason) pendingReasons.set(messageId, reason);
  else pendingReasons.delete(messageId);
}

/** Fired on `window` after feedback is saved, so the "Liked" list can reload. */
export const FEEDBACK_CHANGED_EVENT = "docgenie:feedback-changed";

export async function putFeedback(serverMessageId: string, body: FeedbackIn) {
  const res = await fetch(`/api/messages/${serverMessageId}/feedback`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Feedback failed (${res.status})`);
  window.dispatchEvent(new Event(FEEDBACK_CHANGED_EVENT));
}

/** `submit` for like and dislike; saved to `PUT /api/messages/{id}/feedback`. */
export const feedbackAdapter: FeedbackAdapter = {
  submit({ message, type, comment }) {
    // Message ids come from the server (`message.start`), not from the client.
    const serverId = readCustom(message.metadata.custom).messageId;
    if (!serverId) {
      toast.error("This answer is not saved yet, so feedback can't be recorded.");
      return;
    }
    const reason = pendingReasons.get(message.id);
    pendingReasons.delete(message.id);
    const body: FeedbackIn =
      type === "positive"
        ? { rating: "like" }
        : {
            rating: "dislike",
            ...(reason ? { reason } : {}),
            ...(comment?.trim() ? { comment: comment.trim() } : {}),
          };
    putFeedback(serverId, body).catch(() => {
      toast.error("Couldn't save your feedback. Please try again.");
    });
  },
};

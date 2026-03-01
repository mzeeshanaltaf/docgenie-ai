import { callN8nWebhook } from "./n8n";
import type {
  CreditBalanceResponse,
  CreditHistoryResponse,
} from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_CREDITS_WEBHOOK_ID!;

export function signupCredits(userId: string): Promise<{ success: boolean }> {
  return callN8nWebhook<{ success: boolean }>(WEBHOOK_ID, {
    event_type: "signup_credits",
    user_id: userId,
  });
}

export function getRemainingCredits(
  userId: string
): Promise<CreditBalanceResponse> {
  return callN8nWebhook<CreditBalanceResponse>(WEBHOOK_ID, {
    event_type: "get_remaining_credit",
    user_id: userId,
  });
}

export function getCreditHistory(
  userId: string
): Promise<CreditHistoryResponse> {
  return callN8nWebhook<CreditHistoryResponse>(WEBHOOK_ID, {
    event_type: "credit_history",
    user_id: userId,
  });
}

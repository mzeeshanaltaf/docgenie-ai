import { callN8nWebhook } from "./n8n";
import type {
  CreditBalanceResponse,
  CreditHistoryResponse,
  SignupCreditsResponse,
} from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_CREDITS_WEBHOOK_ID!;

export function signupCredits(
  userId: string
): Promise<SignupCreditsResponse> {
  return callN8nWebhook<SignupCreditsResponse>(WEBHOOK_ID, {
    event_type: "signup_credits",
    user_id: userId,
  });
}

export async function getRemainingCredits(
  userId: string
): Promise<CreditBalanceResponse> {
  const raw = await callN8nWebhook<
    CreditBalanceResponse | CreditBalanceResponse[]
  >(WEBHOOK_ID, {
    event_type: "credit_history",
    user_id: userId,
  });
  const data = Array.isArray(raw) ? raw[0] : raw;
  return {
    credit_balance: Number(data?.credit_balance ?? 0),
    message_balance: Number(data?.message_balance ?? 0),
  };
}

export function getCreditHistory(
  userId: string
): Promise<CreditHistoryResponse> {
  return callN8nWebhook<CreditHistoryResponse>(WEBHOOK_ID, {
    event_type: "credit_history",
    user_id: userId,
  });
}

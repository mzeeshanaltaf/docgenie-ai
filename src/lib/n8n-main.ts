import { callN8nWebhook, callN8nWebhookMultipart } from "./n8n";
import type {
  ProcessResumeResponse,
  ScrapeJdResponse,
  ResumeMatchResponse,
} from "@/types/n8n";

const WEBHOOK_ID = process.env.N8N_MAIN_WEBHOOK_ID!;

export function processResume(
  userId: string,
  formData: FormData,
  isCandidate: boolean
): Promise<ProcessResumeResponse> {
  formData.append("event_type", "process_resume");
  formData.append("user_id", userId);
  formData.append("is_candidate", String(isCandidate));
  return callN8nWebhookMultipart<ProcessResumeResponse>(WEBHOOK_ID, formData);
}

export function scrapeJd(
  userId: string,
  jdUrl: string,
  isCandidate: boolean,
  jdText?: string
): Promise<ScrapeJdResponse> {
  const payload: Record<string, unknown> = {
    event_type: "scrape_jd",
    user_id: userId,
    jd_url: jdUrl,
    is_candidate: isCandidate,
  };
  if (jdText) {
    payload.jd_text = jdText;
  }
  return callN8nWebhook<ScrapeJdResponse>(WEBHOOK_ID, payload);
}

export function runResumeMatch(
  userId: string,
  fileId: string,
  urlId: string,
  isCandidate: boolean
): Promise<ResumeMatchResponse> {
  return callN8nWebhook<ResumeMatchResponse>(WEBHOOK_ID, {
    event_type: "resume_match",
    user_id: userId,
    file_id: fileId,
    url_id: urlId,
    is_candidate: isCandidate,
  });
}

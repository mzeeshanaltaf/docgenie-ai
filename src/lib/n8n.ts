/**
 * n8n webhook client: used only by the contact form (src/app/api/contact).
 *
 * Everything else lives in the FastAPI backend (see lib/backend.ts).
 */

const N8N_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

export class N8nError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "N8nError";
  }
}

/**
 * Call an n8n webhook endpoint with a JSON payload.
 *
 * @param webhookId - The webhook UUID
 * @param payload   - JSON body to send
 * @returns Parsed JSON response from n8n
 */
export async function callN8nWebhook<TResponse = unknown>(
  webhookId: string,
  payload: Record<string, unknown>
): Promise<TResponse> {
  if (!N8N_BASE_URL) {
    throw new N8nError("N8N_WEBHOOK_BASE_URL environment variable is not set.");
  }
  if (!N8N_API_KEY) {
    throw new N8nError("N8N_API_KEY environment variable is not set.");
  }

  const url = `${N8N_BASE_URL.replace(/\/$/, "")}/${webhookId}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": N8N_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new N8nError(
      `n8n webhook call failed: ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<TResponse>;
}

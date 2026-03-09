import { NextRequest } from "next/server";

const CONTACT_WEBHOOK_URL =
  "https://n8n.zeeshanai.cloud/webhook/41afaa4e-6e6e-45f1-b19b-9f1bf49fcfb0";

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const apiKey = process.env.N8N_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Server misconfiguration" }, { status: 503 });
    }

    const n8nRes = await fetch(CONTACT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ name, email, message }),
    });

    if (!n8nRes.ok) {
      console.error("n8n contact webhook error:", n8nRes.status, await n8nRes.text());
      return Response.json({ error: "Submission failed" }, { status: 500 });
    }

    const result = await n8nRes.json();

    if (!result.success) {
      return Response.json({ error: "Submission failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Contact route error:", err);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}

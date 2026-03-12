import { NextRequest } from "next/server";
import { callN8nWebhook } from "@/lib/n8n";

const WEBHOOK_ID = process.env.N8N_CONTACT_FORM_WEBHOOK_ID!;

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await callN8nWebhook<{ success: boolean }>(WEBHOOK_ID, {
      name,
      email,
      message,
    });

    if (!result.success) {
      return Response.json({ error: "Submission failed" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Contact route error:", err);
    return Response.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}

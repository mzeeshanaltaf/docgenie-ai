import { auth } from "@clerk/nextjs/server";
import { getRemainingCredits } from "@/lib/n8n-credits";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await getRemainingCredits(userId);

  return Response.json({
    credit_balance: data.credit_balance,
    message_balance: data.message_balance,
  });
}

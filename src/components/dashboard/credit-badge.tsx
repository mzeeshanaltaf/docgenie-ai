import { auth } from "@clerk/nextjs/server";
import { getRemainingCredits } from "@/lib/n8n-credits";
import { Zap } from "lucide-react";

export async function CreditBadge() {
  const { userId } = await auth();
  if (!userId) return null;

  let balance = 0;
  try {
    const raw = await getRemainingCredits(userId);
    // Normalize: n8n may return an array instead of a plain object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = Array.isArray(raw) ? (raw as any[])[0] : raw;
    balance = typeof data?.current_balance === "number" ? data.current_balance : 0;
  } catch {
    // n8n unavailable — show 0 gracefully
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
      <Zap className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span className="text-xs font-medium">
        <span className="text-foreground">{balance}</span>
        <span className="ml-1 text-muted-foreground">credits left</span>
      </span>
    </div>
  );
}

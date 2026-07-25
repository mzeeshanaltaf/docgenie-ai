import { OTP_SENDER_EMAIL } from "@/lib/constants";

/**
 * Shown wherever a code has just been emailed. Auth codes land in spam often
 * enough that naming the sender up front is the difference between a user
 * finding the mail and giving up.
 */
export function EmailDeliveryNote({ className }: { className?: string }) {
  return (
    <p
      className={`rounded-md border border-border/60 bg-muted/40 px-3 py-2.5 text-center text-xs leading-relaxed text-balance text-muted-foreground ${className ?? ""}`}
    >
      Can&apos;t find the email? Check your spam or junk folder — it arrives
      from{" "}
      <span className="font-medium break-all text-foreground">
        {OTP_SENDER_EMAIL}
      </span>
      .
    </p>
  );
}

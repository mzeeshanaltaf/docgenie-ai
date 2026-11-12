import { OTP_SENDER_EMAIL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Shown wherever a code has just been emailed. Auth codes land in spam often
 * enough that naming the sender up front is the difference between a user
 * finding the mail and giving up.
 */
export function EmailDeliveryNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-md border border-rule bg-muted px-3 py-2.5 text-caption text-muted-foreground",
        className
      )}
    >
      Can&apos;t find the email? Check your spam or junk folder. It comes from
      <span className="mt-0.5 block font-medium break-all text-foreground">{OTP_SENDER_EMAIL}</span>
    </p>
  );
}

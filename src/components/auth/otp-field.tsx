"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/**
 * Six-slot code entry shared by the verify-email and forgot-password screens.
 * Wraps the shadcn primitive so both screens stay visually identical.
 */
export function OtpField({
  value,
  onChange,
  onComplete,
  disabled,
  id = "otp",
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <InputOTP
      id={id}
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus
      containerClassName="justify-center gap-2"
    >
      <InputOTPGroup className="gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot
            key={i}
            index={i}
            className="h-12 w-11 rounded-md border text-lg font-semibold data-[active=true]:border-emerald-500 data-[active=true]:ring-emerald-500/50"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

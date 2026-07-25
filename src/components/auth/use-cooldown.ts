"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Countdown used to throttle "Resend code" buttons on the client, mirroring the
 * emailOTP plugin's 3-sends-per-60s server limit.
 */
export function useCooldown(seconds = 60) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, start, active: remaining > 0 };
}

"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * `prefers-reduced-motion`, safe to use while rendering.
 *
 * motion's own hook answers on the very first client render, but the server
 * cannot know, so a branch on it during render hydrates differently for people
 * who reduce motion. This one reports `false` until after mount, so the first
 * client render matches the server's, then switches. Use motion's hook directly
 * inside effects and handlers, where it is already correct.
 */
export function useReducedMotionSafe(): boolean {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!reduced;
}

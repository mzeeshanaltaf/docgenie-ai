"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide motion defaults (see DESIGN.md, motion rules).
 * `reducedMotion="user"` makes every `motion.*` element drop transform and
 * layout animation when the OS asks for reduced motion; opacity still fades.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </MotionConfig>
  );
}

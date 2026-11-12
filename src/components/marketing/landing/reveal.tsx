"use client";

import { motion } from "motion/react";
import { reveal } from "@/lib/motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";

/**
 * A scroll reveal: fades and rises 12px once, in view. Falls back to a plain
 * element under reduced motion. Starts hidden only because it is driven by
 * `whileInView`; without JS the landing page's <noscript> rule shows it.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotionSafe();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      {...reveal}
      transition={{ ...reveal.transition, delay }}
    >
      {children}
    </motion.div>
  );
}

"use client";

import { useEffect, useRef } from "react";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score: number): string {
  if (score >= 75) return "#10b981"; // emerald
  if (score >= 50) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent fit";
  if (score >= 65) return "Good fit";
  if (score >= 50) return "Moderate fit";
  return "Low fit";
}

export function ScoreRing({ score }: { score: number }) {
  const circleRef = useRef<SVGCircleElement>(null);
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  const color = scoreColor(score);

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    // Start at 0, animate to target offset
    el.style.strokeDashoffset = String(CIRCUMFERENCE);
    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)";
      el.style.strokeDashoffset = String(offset);
    });
    return () => cancelAnimationFrame(raf);
  }, [offset]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-36 w-36">
        <svg
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
          aria-label={`Match score: ${score}%`}
        >
          {/* Track */}
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          {/* Progress */}
          <circle
            ref={circleRef}
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span
        className="rounded-full px-3 py-1 text-xs font-semibold"
        style={{ background: `${color}20`, color }}
      >
        {scoreLabel(score)}
      </span>
    </div>
  );
}

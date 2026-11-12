import Link from "next/link";
import { cn } from "@/lib/utils";
import { LOGO_MARK } from "@/lib/brand";

/** The mark alone, drawn in the current text color. Geometry lives in lib/brand.ts. */
export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  const { viewBox, frame, lines, strokeWidth } = LOGO_MARK;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.size}
        height={frame.size}
        rx={frame.radius}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {lines.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" />
      ))}
    </svg>
  );
}

/**
 * The DocGenie mark (a ruled square holding a page of text) plus the name.
 * Ink only. The accent is not spent on the logo (The One Mark Rule).
 */
export function Wordmark({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="DocGenie, home"
      className={cn(
        "inline-flex items-center gap-2 rounded-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      <LogoMark />
      <span className="text-[1.0625rem] leading-none font-semibold tracking-tight">DocGenie</span>
    </Link>
  );
}

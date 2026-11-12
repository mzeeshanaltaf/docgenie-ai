import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The DocGenie mark: a ruled square holding a page corner, then the name.
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
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 7h8M6 10h8M6 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
      <span className="text-[1.0625rem] leading-none font-semibold tracking-tight">DocGenie</span>
    </Link>
  );
}

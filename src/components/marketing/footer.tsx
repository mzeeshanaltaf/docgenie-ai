import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

const LINKS = [
  ["About", "/about"],
  ["Contact", "/contact"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
] as const;

export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="page-container flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="figure text-caption text-muted-foreground">
            {new Date().getFullYear()}
          </span>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {LINKS.map(([label, href]) => (
              <li key={label}>
                <Link
                  href={href}
                  className="inline-flex min-h-9 items-center rounded-sm text-body-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

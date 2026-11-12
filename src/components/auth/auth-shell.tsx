import { Wordmark } from "@/components/wordmark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  MAX_UPLOAD_MB,
  MAX_UPLOAD_PAGES,
  SIGNUP_DOCUMENT_CREDITS,
  SIGNUP_MESSAGE_CREDITS,
} from "@/lib/constants";

const N = ({ children }: { children: React.ReactNode }) => <span className="figure">{children}</span>;

const FACTS: { label: string; value: React.ReactNode }[] = [
  { label: "Formats", value: "PDF, DOCX, TXT, CSV" },
  {
    label: "Per file",
    value: (
      <>
        <N>{MAX_UPLOAD_MB}</N> MB, <N>{MAX_UPLOAD_PAGES}</N> pages
      </>
    ),
  },
  { label: "Scanned PDFs", value: "Read with OCR" },
  {
    label: "New account",
    value: (
      <>
        <N>{SIGNUP_DOCUMENT_CREDITS}</N> documents, <N>{SIGNUP_MESSAGE_CREDITS}</N> messages
      </>
    ),
  },
];

/**
 * The two-area frame shared by every auth page: a ruled header row, then the
 * 12-column grid with a statement and the product's real limits on the left
 * and the form on the right, split by one hairline. Below `lg` the left area
 * drops away and the form is left to carry the page.
 *
 * Server component: no state, so each page can render it directly and pass the
 * (client) form as children.
 */
export function AuthShell({
  lead,
  children,
}: {
  /** One sentence for the left area. Plain statement, no marketing. */
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-rule">
        <div className="page-container flex h-14 items-center justify-between">
          <Wordmark />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="page-container">
        <div className="page-grid min-h-[calc(100svh-3.5rem)]">
          <aside
            aria-label="About DocGenie"
            className="hidden flex-col justify-between py-16 lg:col-span-5 lg:flex"
          >
            <p className="text-section measure text-balance">{lead}</p>
            <dl className="mt-16 max-w-md border-b border-rule">
              {FACTS.map((f) => (
                <div
                  key={f.label}
                  className="flex items-baseline justify-between gap-6 border-t border-rule py-2.5"
                >
                  <dt className="ds-label">{f.label}</dt>
                  <dd className="text-body-sm">{f.value}</dd>
                </div>
              ))}
            </dl>
          </aside>

          <div className="col-span-4 flex items-start py-10 md:col-span-6 md:col-start-4 lg:col-span-5 lg:col-start-8 lg:items-center lg:border-l lg:border-rule lg:py-16 lg:pl-12">
            <div className="w-full max-w-sm">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/components/marketing/landing/content";

export type LegalSection = { title: string; body: string[] };

/**
 * Shared layout for Privacy and Terms: a title row, then one ruled row per
 * numbered section with its heading on the left and the text on the right.
 */
export function LegalPage({
  title,
  path,
  updated,
  intro,
  sections,
  closing,
}: {
  title: string;
  path: string;
  /** Shown as written, e.g. "12 November 2026". */
  updated: string;
  intro: string;
  sections: LegalSection[];
  closing: { title: string; body: string };
}) {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: title, item: `${SITE_URL}${path}` },
    ],
  };

  return (
    <MarketingPage>
      <JsonLd data={breadcrumb} />
      <div className="page-container pt-12 pb-24 md:pt-16 md:pb-32">
        <header className="page-grid gap-y-4 pb-10 md:pb-14">
          <div className="col-span-4 md:col-span-12 lg:col-span-8">
            <h1 className="text-section text-balance">{title}</h1>
            <p className="mt-3 text-body-sm text-muted-foreground">
              Last updated <time className="figure">{updated}</time>
            </p>
            <p className="measure mt-5 text-body text-muted-foreground">{intro}</p>
          </div>
        </header>

        <div className="border-b border-rule">
          {sections.map(({ title: heading, body }) => (
            <section
              key={heading}
              aria-labelledby={headingId(heading)}
              className="page-grid gap-y-3 border-t border-rule py-6 md:py-8"
            >
              <h2
                id={headingId(heading)}
                className="col-span-4 text-title md:col-span-12 lg:col-span-4"
              >
                {heading}
              </h2>
              <div className="col-span-4 space-y-3 md:col-span-12 lg:col-span-7 lg:col-start-6">
                {body.map((p) => (
                  <p key={p} className="measure text-body text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="page-grid mt-10 gap-y-2">
          <div className="col-span-4 md:col-span-12 lg:col-span-7 lg:col-start-6">
            <p className="text-title">{closing.title}</p>
            <p className="measure mt-1 text-body text-muted-foreground">
              {closing.body}{" "}
              <Link
                href="/contact"
                className="rounded-sm text-brand underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Contact
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </MarketingPage>
  );
}

function headingId(heading: string): string {
  return `s-${heading.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

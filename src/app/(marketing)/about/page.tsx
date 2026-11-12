import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/components/marketing/landing/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "DocGenie is a working document question-answering system, built so its retrieval, agent and costs can be inspected.",
  alternates: { canonical: "/about" },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "About", item: `${SITE_URL}/about` },
  ],
};

const NOTES: { title: string; body: string }[] = [
  {
    title: "What it is",
    body: "A document question-answering system you can use. You upload a PDF, DOCX, TXT or CSV, ask a question, and get an answer that cites the page it came from. The original opens at that page with the passage marked.",
  },
  {
    title: "Why it shows its work",
    body: "A chat box that returns confident text proves nothing. Here the tool calls, the search, the timings and the token counts sit under each answer, so you can judge the answer and the system that produced it.",
  },
  {
    title: "What it does not do",
    body: "It does not replace reading a document that matters. The model can misread a passage, which is why every claim carries a source. There is also no paid plan: the free preview is the whole offer.",
  },
  {
    title: "How it is built",
    body: "A Next.js front end, a private FastAPI backend, Postgres with pgvector for retrieval, and private object storage for the files. The landing page lists the stack and the limits with their real values.",
  },
];

export default function AboutPage() {
  return (
    <MarketingPage>
      <JsonLd data={breadcrumbSchema} />
      <div className="page-container pt-12 pb-24 md:pt-16 md:pb-32">
        <header className="page-grid gap-y-6 pb-12 md:pb-16">
          <h1 className="col-span-4 text-section text-balance md:col-span-12 lg:col-span-8">
            A document Q&amp;A system built to be inspected.
          </h1>
        </header>

        <div className="border-b border-rule">
          {NOTES.map((n) => (
            <section
              key={n.title}
              aria-label={n.title}
              className="page-grid gap-y-2 border-t border-rule py-6 md:py-8"
            >
              <h2 className="col-span-4 text-title md:col-span-12 lg:col-span-4">{n.title}</h2>
              <p className="measure col-span-4 text-body text-muted-foreground md:col-span-12 lg:col-span-7 lg:col-start-6">
                {n.body}
              </p>
            </section>
          ))}
        </div>

        <div className="page-grid mt-10 gap-y-4">
          <div className="col-span-4 flex flex-wrap gap-3 md:col-span-12 lg:col-span-7 lg:col-start-6">
            <Button asChild>
              <Link href="/#pipeline">How an answer is made</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contact">Contact</Link>
            </Button>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}

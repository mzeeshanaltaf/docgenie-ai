import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { FileText, MessageSquare, Zap, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about DocGenie — our mission to help people extract knowledge from documents using AI.",
};

const values = [
  {
    icon: MessageSquare,
    title: "Answers over searching",
    description:
      "We believe you shouldn't have to read 50 pages to find one number. Ask a question, get an answer — instantly.",
  },
  {
    icon: Zap,
    title: "Speed that respects your time",
    description:
      "Documents are processed in seconds, and AI responses arrive in under 5 seconds. Because your time matters.",
  },
  {
    icon: Shield,
    title: "Privacy by design",
    description:
      "Your documents are processed securely. We never sell or share your data with third parties.",
  },
  {
    icon: FileText,
    title: "Accurate, not generic",
    description:
      "Every answer is sourced directly from your document content — not hallucinated or pulled from generic knowledge.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border/50 px-4 py-20 md:py-28">
          <div className="container mx-auto max-w-6xl">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              About us
            </p>
            <h1
              className="mt-4 max-w-3xl text-4xl tracking-tight md:text-5xl lg:text-6xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
            >
              Built to make documents{" "}
              <span className="text-emerald-600 dark:text-emerald-400">talk back</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              DocGenie was born from a simple frustration: important answers are buried in
              documents nobody has time to read. We built the tool we wished we had — one that
              reads your documents and answers your questions instantly using AI.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="grid gap-16 md:grid-cols-2 md:items-center">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Our mission
                </p>
                <h2
                  className="mt-4 text-3xl tracking-tight md:text-4xl"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
                >
                  Make knowledge accessible from any document
                </h2>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Every day, people waste hours searching through PDFs, reports, and spreadsheets
                  for answers that should take seconds to find. DocGenie bridges that gap.
                </p>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  Our AI reads and understands your documents, then answers your questions with
                  precise, sourced responses. Whether it&apos;s a financial report, research paper,
                  or employee handbook — just ask.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-8">
                <div className="grid grid-cols-2 gap-6">
                  {[
                    ["4", "Supported file types"],
                    ["< 5s", "Response time"],
                    ["5MB", "Max file size"],
                    ["25", "Free messages"],
                  ].map(([stat, label]) => (
                    <div key={label}>
                      <p className="font-mono text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                        {stat}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="border-t border-border bg-muted/20 px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Our values
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                What we stand for
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {values.map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

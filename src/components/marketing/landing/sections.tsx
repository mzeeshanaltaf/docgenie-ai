import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { AuthCta } from "@/components/marketing/auth-cta";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/app/tag";
import {
  MAX_UPLOAD_MB,
  MAX_UPLOAD_PAGES,
  SIGNUP_DOCUMENT_CREDITS,
  SIGNUP_MESSAGE_CREDITS,
} from "@/lib/constants";
import {
  FAQS,
  FILE_LIMIT,
  FORMAT_ROWS,
  PREVIEW_ROWS,
  STACK_NOTES,
  STACK_TAGS,
} from "./content";
import { HeroReplay } from "./hero-replay";
import { Pipeline } from "./pipeline";
import { Reveal } from "./reveal";

/**
 * Section frame: a heavier hairline opens each section, the heading sits on the
 * left four columns and the content on the right eight. Spacing alternates
 * between sections (DESIGN.md, Rhythm), so each passes its own padding.
 */
function Band({
  id,
  title,
  lead,
  className,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <div className="page-container">
        <div className={`page-grid gap-y-8 border-t border-rule-strong ${className ?? ""}`}>
          <header className="col-span-4 md:col-span-12 lg:col-span-4">
            <div className="lg:sticky lg:top-8">
              <h2 id={`${id}-title`} className="text-section text-balance">
                {title}
              </h2>
              {lead && <p className="mt-3 max-w-sm text-body text-muted-foreground">{lead}</p>}
            </div>
          </header>
          <div className="col-span-4 md:col-span-12 lg:col-span-8">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <div className="page-container pt-10 pb-20 md:pt-16 md:pb-28">
        <div className="page-grid gap-y-12">
          <div className="col-span-4 md:col-span-12 lg:col-span-5 lg:pt-4">
            <h1 id="hero-title" className="text-display text-balance">
              Ask your documents. Check the source.
            </h1>
            <p className="measure mt-6 max-w-md text-body text-muted-foreground">
              DocGenie answers questions about PDF, DOCX, TXT and CSV files. Every answer cites the
              page it used, opens the original there, and shows the search and the timings behind it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <AuthCta signedOutLabel="Try it free" arrow className="h-10" />
              <Button asChild variant="outline" size="lg">
                <Link href="/#pipeline">See how it works</Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-6 border-t border-rule">
              <div className="border-b border-rule py-2.5">
                <dt className="ds-label">Free preview</dt>
                <dd className="text-body-sm">
                  <span className="figure">{SIGNUP_DOCUMENT_CREDITS}</span> documents,{" "}
                  <span className="figure">{SIGNUP_MESSAGE_CREDITS}</span> messages
                </dd>
              </div>
              <div className="border-b border-rule py-2.5">
                <dt className="ds-label">Per file</dt>
                <dd className="text-body-sm">
                  <span className="figure">{MAX_UPLOAD_MB}</span> MB,{" "}
                  <span className="figure">{MAX_UPLOAD_PAGES}</span> pages
                </dd>
              </div>
            </dl>
          </div>

          <div className="col-span-4 md:col-span-12 lg:col-span-7">
            <HeroReplay />
          </div>
        </div>
      </div>
    </section>
  );
}

export function PipelineSection() {
  return (
    <Band
      id="pipeline"
      title="How an answer is made"
      lead="The same five stages run for every file you upload and every question you ask."
      className="pt-8 pb-20 md:pb-28"
    >
      <Pipeline />
    </Band>
  );
}

export function LimitsSection() {
  return (
    <Band
      id="limits"
      title="What it handles"
      lead={`Files up to ${FILE_LIMIT}. These are the limits the upload enforces, not targets.`}
      className="pt-8 pb-16 md:pb-20"
    >
      <Reveal>
        <table className="w-full text-left">
          <caption className="sr-only">Supported formats, how each is read, and its limit</caption>
          <thead>
            <tr className="bg-muted">
              <th scope="col" className="ds-label w-20 px-3 py-2 font-medium sm:w-28">
                Format
              </th>
              <th scope="col" className="ds-label px-3 py-2 font-medium">
                How it is read
              </th>
              <th scope="col" className="ds-label px-3 py-2 text-right font-medium">
                Limit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule border-b border-rule">
            {FORMAT_ROWS.map((r) => (
              <tr key={r.format} className="align-top">
                <th scope="row" className="px-3 py-3 text-left">
                  <Tag>{r.format}</Tag>
                </th>
                <td className="measure px-3 py-3 text-body-sm text-muted-foreground">{r.how}</td>
                <td className="figure px-3 py-3 text-right text-body-sm whitespace-nowrap">
                  {r.limit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-body-sm text-muted-foreground">
          Every format is capped at <span className="figure text-foreground">{FILE_LIMIT}</span> per
          file. Anything over a limit is refused and no credit is kept.
        </p>
      </Reveal>
    </Band>
  );
}

export function StackSection() {
  return (
    <Band
      id="stack"
      title="Under the hood"
      lead="Choices that matter to someone reading the code, with the numbers they ask about."
      className="pt-8 pb-24 md:pb-32"
    >
      <dl className="grid gap-x-10 sm:grid-cols-2">
        {STACK_NOTES.map((note, i) => (
          <Reveal key={note.title} delay={(i % 2) * 0.06} className="border-t border-rule py-4">
            <dt className="text-title">{note.title}</dt>
            <dd className="mt-2 text-body-sm text-muted-foreground">{note.body}</dd>
          </Reveal>
        ))}
      </dl>
      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Built with">
        {STACK_TAGS.map((t) => (
          <li key={t}>
            <Tag>{t}</Tag>
          </li>
        ))}
      </ul>
    </Band>
  );
}

export function PreviewSection() {
  return (
    <Band
      id="preview"
      title="A free preview"
      lead="Enough to upload a few files and ask real questions. This is a demonstration, not a service you can pay for."
      className="pt-8 pb-16 md:pb-24"
    >
      <Reveal>
        <dl className="border-b border-rule">
          {PREVIEW_ROWS.map((r) => (
            <div
              key={r.label}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-rule py-3 sm:grid-cols-[8rem_4rem_1fr]"
            >
              <dt className="ds-label">{r.label}</dt>
              <dd className="figure text-title sm:text-right">{r.value}</dd>
              <dd className="col-span-2 text-body-sm text-muted-foreground sm:col-span-1">
                {r.note}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <AuthCta signedOutLabel="Create a free account" signedInLabel="Open your dashboard" arrow />
        </div>
      </Reveal>
    </Band>
  );
}

export function FaqSection() {
  return (
    <Band id="faq" title="Questions" className="pt-8 pb-20 md:pb-28">
      <div className="divide-y divide-rule border-b border-rule">
        {FAQS.map(({ q, a }, i) => (
          <details key={q} className="group" name="faq" open={i === 0}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 text-title focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="measure pb-5 text-body text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Band>
  );
}

export function ClosingSection() {
  return (
    <section aria-labelledby="closing-title">
      <div className="page-container">
        <div className="page-grid items-end gap-y-6 border-t border-rule-strong pt-12 pb-24 md:pt-16 md:pb-32">
          <h2
            id="closing-title"
            className="col-span-4 text-section text-balance md:col-span-8 lg:col-span-7"
          >
            Upload a file and ask it something.
          </h2>
          <div className="col-span-4 flex flex-wrap items-center gap-3 md:col-span-4 md:justify-end lg:col-span-5">
            <AuthCta signedOutLabel="Try it free" arrow className="h-10" />
            <Button asChild variant="outline" size="lg">
              <Link href="/contact">Contact</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

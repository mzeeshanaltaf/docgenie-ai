import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { ContactDialog } from "@/components/marketing/contact-dialog";
import {
  ArrowRight,
  Check,
  FileText,
  MessageSquare,
  BookOpen,
  Upload,
  Sparkles,
  LayoutList,
} from "lucide-react";

/* ─── Animation styles (CSS-only, server-component safe) ───────────── */
const animStyles = `
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  .au-1 { opacity: 0; animation: fade-up 0.6s ease-out 0.05s forwards; }
  .au-2 { opacity: 0; animation: fade-up 0.6s ease-out 0.15s forwards; }
  .au-3 { opacity: 0; animation: fade-up 0.6s ease-out 0.25s forwards; }
  .au-4 { opacity: 0; animation: fade-up 0.6s ease-out 0.35s forwards; }
  .au-5 { opacity: 0; animation: fade-up 0.6s ease-out 0.45s forwards; }
  .au-6 { opacity: 0; animation: fade-up 0.6s ease-out 0.20s forwards; }

  @keyframes chat-msg-1 {
    0%, 15%  { opacity: 0; transform: translateY(8px); }
    20%, 100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes chat-msg-2 {
    0%, 35%  { opacity: 0; transform: translateY(8px); }
    40%, 100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes chat-msg-3 {
    0%, 55%  { opacity: 0; transform: translateY(8px); }
    60%, 100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes chat-msg-4 {
    0%, 75%  { opacity: 0; transform: translateY(8px); }
    80%, 100% { opacity: 1; transform: translateY(0); }
  }
  .chat-1 { opacity: 0; animation: chat-msg-1 4s ease-out 0.6s forwards; }
  .chat-2 { opacity: 0; animation: chat-msg-2 4s ease-out 0.6s forwards; }
  .chat-3 { opacity: 0; animation: chat-msg-3 4s ease-out 0.6s forwards; }
  .chat-4 { opacity: 0; animation: chat-msg-4 4s ease-out 0.6s forwards; }

  @keyframes typing-dot {
    0%, 20% { opacity: 0.3; }
    50% { opacity: 1; }
    80%, 100% { opacity: 0.3; }
  }
  .typing-dot-1 { animation: typing-dot 1.4s ease-in-out infinite; }
  .typing-dot-2 { animation: typing-dot 1.4s ease-in-out 0.2s infinite; }
  .typing-dot-3 { animation: typing-dot 1.4s ease-in-out 0.4s infinite; }

  @keyframes pulse-soft {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  .pulse-soft { animation: pulse-soft 3s ease-in-out infinite; }
`;

/* ─── Data ─────────────────────────────────────────────────────────── */
const features = [
  {
    icon: FileText,
    num: "01",
    title: "Smart Document Processing",
    metric: "4 file types",
    description:
      "Upload PDFs, Word documents, text files, or CSV spreadsheets. DocGenie extracts and indexes content for instant retrieval.",
  },
  {
    icon: MessageSquare,
    num: "02",
    title: "AI-Powered Chat",
    metric: "< 5 seconds",
    description:
      "Ask questions in natural language and get precise answers sourced directly from your documents. No more manual searching.",
  },
  {
    icon: LayoutList,
    num: "03",
    title: "Session Management",
    metric: "Unlimited",
    description:
      "Organize conversations by topic with auto-generated titles. Your chat history is always searchable and accessible.",
  },
];

const steps = [
  {
    num: "01",
    title: "Upload Your Document",
    description:
      "Drop your PDF, Word doc, text file, or CSV. We process and index it instantly for AI retrieval.",
  },
  {
    num: "02",
    title: "Start a Conversation",
    description:
      "Ask any question about your document in natural language. DocGenie understands context and nuance.",
  },
  {
    num: "03",
    title: "Get Instant Answers",
    description:
      "Receive AI-powered answers sourced directly from your document content, with precise and relevant responses.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "For getting started",
    features: [
      "5 document credits",
      "25 AI messages",
      "PDF, DOCX, TXT, CSV support",
      "Unlimited chat sessions",
    ],
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/ month",
    desc: "For power users",
    features: [
      "50 document credits / month",
      "500 AI messages / month",
      "Priority processing",
      "Advanced document analysis",
      "Priority support",
    ],
    cta: "Coming soon",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    desc: "For teams and organizations",
    features: [
      "Everything in Pro",
      "Unlimited documents",
      "API access",
      "Custom integrations",
      "Dedicated account manager",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];

/* ─── Page ─────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <style>{animStyles}</style>
      <Navbar />

      <main className="flex-1">

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-4 py-20 md:py-28 lg:py-36">
          {/* Subtle dot grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="container relative mx-auto max-w-6xl">
            <div className="grid items-center gap-14 lg:grid-cols-[1fr_460px]">

              {/* Left: copy */}
              <div>
                <div className="au-1">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-soft" />
                    AI-Powered Document Q&A
                  </span>
                </div>

                <h1
                  className="au-2 mt-5 text-5xl leading-[1.08] tracking-tight md:text-6xl lg:text-[4.5rem]"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
                >
                  Your documents,
                  <br />
                  <span className="text-emerald-600 dark:text-emerald-400">answered.</span>
                </h1>

                <p className="au-3 mt-6 max-w-120 text-lg leading-relaxed text-muted-foreground">
                  Upload any PDF, Word doc, or spreadsheet and start a
                  conversation. DocGenie reads, understands, and answers your
                  questions instantly.
                </p>

                <div className="au-4 mt-8 flex flex-wrap items-center gap-3">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button
                        size="lg"
                        className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-slate-950"
                      >
                        Start for free <ArrowRight className="h-4 w-4" />
                      </Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Button
                      asChild
                      size="lg"
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Link href="/dashboard">
                        Go to Dashboard <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SignedIn>
                  <Button variant="outline" size="lg" asChild>
                    <Link href="#how-it-works">See how it works</Link>
                  </Button>
                </div>

                <p className="au-5 mt-5 text-xs text-muted-foreground">
                  No credit card required · 5 document credits · 25 AI messages
                </p>
              </div>

              {/* Right: animated chat interface mockup */}
              <div className="au-6">
                <div className="relative">
                  {/* Ambient glow */}
                  <div className="absolute -inset-6 rounded-3xl bg-emerald-500/10 blur-3xl dark:bg-emerald-500/8" />

                  <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
                    {/* Chat header */}
                    <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                        <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">DocGenie</p>
                        <p className="text-[10px] text-muted-foreground">Q4_Financial_Report.pdf</p>
                      </div>
                      <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-soft" />
                        Active
                      </span>
                    </div>

                    {/* Chat messages */}
                    <div className="space-y-3 px-5 py-5" style={{ minHeight: "280px" }}>
                      {/* User message */}
                      <div className="chat-1 flex justify-end">
                        <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-emerald-600 px-4 py-2.5 text-sm text-white dark:bg-emerald-500 dark:text-slate-950">
                          What was the total revenue in Q4?
                        </div>
                      </div>

                      {/* AI response */}
                      <div className="chat-2 flex gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 mt-0.5">
                          <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-muted px-4 py-2.5 text-sm">
                          Total revenue for Q4 was <span className="font-semibold text-emerald-600 dark:text-emerald-400">$4.2M</span>, representing a 23% increase over Q3. The primary drivers were enterprise contracts and new market expansion.
                        </div>
                      </div>

                      {/* User follow-up */}
                      <div className="chat-3 flex justify-end">
                        <div className="max-w-[75%] rounded-2xl rounded-tr-md bg-emerald-600 px-4 py-2.5 text-sm text-white dark:bg-emerald-500 dark:text-slate-950">
                          Which region contributed the most?
                        </div>
                      </div>

                      {/* AI typing indicator */}
                      <div className="chat-4 flex gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 mt-0.5">
                          <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="rounded-2xl rounded-tl-md bg-muted px-4 py-3">
                          <div className="flex gap-1">
                            <span className="typing-dot-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                            <span className="typing-dot-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                            <span className="typing-dot-3 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Input bar */}
                    <div className="border-t border-border px-5 py-3">
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <span className="flex-1 text-xs text-muted-foreground">Ask about your document...</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 dark:bg-emerald-500">
                          <ArrowRight className="h-3 w-3 text-white dark:text-slate-950" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────── */}
        <section id="features" className="border-y border-border bg-muted/20 px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Features
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                Everything you need to unlock your documents
              </h2>
              <p className="mt-3 max-w-md mx-auto text-muted-foreground">
                From upload to insight in seconds. No manual searching, no endless scrolling.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {features.map(({ icon: Icon, num, title, metric, description }) => (
                <div
                  key={title}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all hover:border-emerald-500/30 hover:shadow-md"
                >
                  <span
                    className="pointer-events-none absolute right-3 top-2 select-none font-mono text-8xl font-bold leading-none text-muted-foreground/10"
                    aria-hidden
                  >
                    {num}
                  </span>

                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="mt-4 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {metric}
                    </p>
                    <h3 className="mt-1 font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How It Works ──────────────────────────────────────────── */}
        <section id="how-it-works" className="px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                How it works
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                Three steps to your answers
              </h2>
              <p className="mt-3 text-muted-foreground">
                From upload to insight in under a minute.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              {steps.map(({ num, title, description }, i) => (
                <div key={num} className="relative flex flex-col items-center px-4 text-center">
                  {i < steps.length - 1 && (
                    <div className="absolute left-[calc(50%+2.5rem)] top-8 hidden h-px w-[calc(100%-5rem)] border-t border-dashed border-border md:block" />
                  )}

                  <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-500/30 bg-emerald-500/8">
                    <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {num}
                    </span>
                  </div>

                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Supported Formats ──────────────────────────────────────── */}
        <section className="border-y border-border bg-muted/20 px-4 py-16">
          <div className="container mx-auto max-w-6xl text-center">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Supported formats
            </p>
            <h2
              className="mt-3 text-2xl tracking-tight md:text-3xl"
              style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
            >
              Works with your documents
            </h2>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
              {[
                { ext: "PDF", color: "text-red-500", bg: "bg-red-500/10" },
                { ext: "DOCX", color: "text-blue-500", bg: "bg-blue-500/10" },
                { ext: "TXT", color: "text-amber-500", bg: "bg-amber-500/10" },
                { ext: "CSV", color: "text-emerald-500", bg: "bg-emerald-500/10" },
              ].map(({ ext, color, bg }) => (
                <div
                  key={ext}
                  className={`flex h-20 w-20 flex-col items-center justify-center rounded-xl border border-border ${bg}`}
                >
                  <Upload className={`h-5 w-5 ${color}`} />
                  <span className={`mt-1 font-mono text-xs font-bold ${color}`}>{ext}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Up to 5MB per file · Max 20 pages per document
            </p>
          </div>
        </section>

        {/* ── Pricing ───────────────────────────────────────────────── */}
        <section id="pricing" className="px-4 py-20">
          <div className="container mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pricing
              </p>
              <h2
                className="mt-3 text-3xl tracking-tight md:text-4xl"
                style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
              >
                Simple, transparent pricing
              </h2>
              <p className="mt-3 text-muted-foreground">Start free. Upgrade when you need more.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 md:items-start">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative rounded-xl border p-6 ${
                    plan.highlight
                      ? "border-emerald-500 shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/20"
                      : "border-border bg-card"
                  }`}
                >
                  {plan.highlight && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-emerald-500/4" />
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="rounded-full bg-amber-500 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white">
                          Coming Soon
                        </span>
                      </div>
                    </>
                  )}

                  <div className="relative">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {plan.name}
                    </p>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>

                    <ul className="mt-6 space-y-2.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2.5 text-sm">
                          <Check
                            className={`h-4 w-4 shrink-0 ${
                              plan.highlight ? "text-emerald-500" : "text-muted-foreground"
                            }`}
                          />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8">
                      {plan.name === "Enterprise" ? (
                        <ContactDialog
                          triggerLabel="Contact sales"
                          triggerClassName="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                        />
                      ) : plan.name === "Pro" ? (
                        <Button className="w-full" variant="outline" disabled>
                          Coming Soon
                        </Button>
                      ) : (
                        <>
                          <SignedOut>
                            <SignInButton mode="modal">
                              <Button className="w-full" variant="outline">
                                {plan.cta}
                              </Button>
                            </SignInButton>
                          </SignedOut>
                          <SignedIn>
                            <Button asChild className="w-full" variant="outline">
                              <Link href="/dashboard">{plan.cta}</Link>
                            </Button>
                          </SignedIn>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Banner ────────────────────────────────────────────── */}
        <section className="px-4 py-20">
          <div className="container mx-auto max-w-4xl">
            <div className="relative overflow-hidden rounded-2xl bg-slate-950 px-8 py-16 text-center dark:bg-slate-900 dark:ring-1 dark:ring-white/10">
              {/* Grid overlay */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)",
                  backgroundSize: "36px 36px",
                }}
              />
              {/* Glow */}
              <div className="pointer-events-none absolute inset-x-0 -top-24 flex justify-center">
                <div className="h-48 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
              </div>

              <div className="relative">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                  Ready to get started?
                </p>
                <h2
                  className="mt-4 text-3xl text-white md:text-4xl"
                  style={{ fontFamily: "var(--font-display), Georgia, serif", fontStyle: "italic" }}
                >
                  Stop searching. Start asking.
                </h2>
                <p className="mt-4 text-slate-400">
                  Upload your first document and get answers in seconds.
                  <br className="hidden sm:block" />
                  5 document credits and 25 messages — completely free.
                </p>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <SignedOut>
                    <SignInButton mode="modal">
                      <Button
                        size="lg"
                        className="gap-2 bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        Get started for free <ArrowRight className="h-4 w-4" />
                      </Button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <Button
                      asChild
                      size="lg"
                      className="gap-2 bg-emerald-500 font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      <Link href="/dashboard">
                        Go to Dashboard <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </SignedIn>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                    asChild
                  >
                    <Link href="#pricing">View pricing</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

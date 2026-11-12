"use client";

import Link from "next/link";
import { ArrowRight, MessageSquare, Upload } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, PageShell, Section } from "@/components/app/page-shell";
import { StatusTag } from "@/components/app/tag";
import { ledgerLabel } from "@/lib/credits";
import { describeIngestionFailure } from "@/lib/document-errors";
import { formatDateTime, formatDay, formatDelta } from "@/lib/format";
import { MAX_UPLOAD_MB, MAX_UPLOAD_PAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";


function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-sm text-body-sm font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}

/** One series of the 14-day strip. Lightness steps, not hue, separate today from the past. */
function DailyBars({
  label,
  unit,
  days,
}: {
  label: string;
  unit: string;
  days: { date: string; value: number }[];
}) {
  const max = Math.max(1, ...days.map((d) => d.value));
  const total = days.reduce((n, d) => n + d.value, 0);
  const peak = days.reduce((a, b) => (b.value > a.value ? b : a), days[0]);
  const summary = total
    ? `${label} per day, last ${days.length} days: ${total} in total, most on ${formatDay(peak.date)} (${peak.value}).`
    : `${label} per day, last ${days.length} days: none.`;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="ds-label">{label}</span>
        <span className="figure text-body-sm">
          {total} <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <div role="img" aria-label={summary} className="mt-2 flex h-10 items-end gap-0.5">
        {days.map((d, i) => (
          <div
            key={d.date}
            title={`${formatDay(d.date)}: ${d.value}`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={cn(
                "w-full rounded-xs",
                d.value === 0
                  ? "bg-rule-strong"
                  : i === days.length - 1
                    ? "bg-chart-2"
                    : "bg-chart-3"
              )}
              style={{ height: d.value === 0 ? "2px" : `${Math.max(10, (d.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="figure mt-1 flex justify-between text-caption text-muted-foreground">
        <span>{formatDay(days[0].date)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <PageShell>
      <div className="space-y-2 pb-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="page-grid gap-y-10">
        <div className="col-span-4 space-y-10 md:col-span-12 lg:col-span-7">
          {[0, 1].map((s) => (
            <div key={s} className="border-t border-rule-strong pt-3">
              <Skeleton className="mb-4 h-5 w-40" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between border-b border-rule py-2.5">
                  <Skeleton className="h-4 w-48 max-w-[60%]" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="col-span-4 md:col-span-12 lg:col-span-4 lg:col-start-9">
          <div className="border-t border-rule-strong pt-3">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function GetStarted({ documents, messages }: { documents: number; messages: number }) {
  const steps = [
    {
      title: "Upload a file",
      body: `PDF, DOCX, TXT or CSV, up to ${MAX_UPLOAD_MB} MB and ${MAX_UPLOAD_PAGES} pages. Scanned PDFs are read with OCR. Each upload uses one document credit.`,
    },
    {
      title: "Wait for Ready",
      body: "Reading takes a few seconds. The status changes to Ready, or says why it failed and refunds the credit.",
    },
    {
      title: "Ask in chat",
      body: "Answers cite the page they came from. Select a citation to open the source with the passage marked.",
    },
  ];
  return (
    <Section title="Start with a document">
      <ol className="divide-y divide-rule border-t border-rule">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2.25rem_1fr] gap-x-2 py-4">
            <span className="figure pt-0.5 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="measure mt-0.5 text-body-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-body-sm text-muted-foreground">
        You have <span className="figure text-foreground">{documents}</span> document credits and{" "}
        <span className="figure text-foreground">{messages}</span> messages.
      </p>
    </Section>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const { dashboard, loading, creditBalance, messageBalance } = useDashboardData();

  if (loading || !dashboard) return <OverviewSkeleton />;

  const isNew = dashboard.counts.documents === 0;
  const { usage } = dashboard;
  const hasSpend = usage.documents_spent + usage.messages_spent > 0;
  const hasSidebarContent = hasSpend || dashboard.recent_sessions.length > 0;

  return (
    <PageShell>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/chat">
                <MessageSquare aria-hidden /> New chat
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/documents">
                <Upload aria-hidden /> Upload
              </Link>
            </Button>
          </>
        }
      />

      <div className="page-grid gap-y-10">
        <div className="col-span-4 space-y-10 md:col-span-12 lg:col-span-7">
          {isNew ? (
            <GetStarted documents={creditBalance ?? 0} messages={messageBalance ?? 0} />
          ) : (
            <Section title="Recent documents" action={<SectionLink href="/dashboard/documents">All documents</SectionLink>}>
              <ul className="divide-y divide-rule border-t border-rule">
                {dashboard.recent_documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-body-sm font-medium">{d.file_name}</p>
                      {d.status === "failed" ? (
                        <p className="text-caption text-muted-foreground">
                          {describeIngestionFailure(d.error_code).title}. Credit refunded.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusTag status={d.status} />
                      <span className="figure w-14 text-right text-caption text-muted-foreground">
                        {formatDay(d.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Recent activity">
            {dashboard.recent_activity.length === 0 ? (
              <p className="border-t border-rule py-4 text-body-sm text-muted-foreground">
                Credit changes show up here: uploads, chat messages and refunds.
              </p>
            ) : (
              <ul className="divide-y divide-rule border-t border-rule">
                {dashboard.recent_activity.map((a, i) => (
                  <li key={`${a.created_at}-${i}`} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium">{ledgerLabel(a.kind, a.unit_type)}</p>
                      {a.file_name ? (
                        <p className="truncate text-caption text-muted-foreground">{a.file_name}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-baseline gap-4">
                      <span className="figure text-caption text-muted-foreground">
                        {formatDateTime(a.created_at)}
                      </span>
                      <span className="figure w-8 text-right text-body-sm font-medium">
                        <span className="sr-only">
                          {a.amount_delta >= 0 ? "Plus " : "Minus "}
                        </span>
                        {formatDelta(a.amount_delta)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {hasSidebarContent ? (
          <div className="col-span-4 space-y-10 md:col-span-12 lg:col-span-4 lg:col-start-9">
            {hasSpend ? (
              <Section title="Usage, 14 days">
                <div className="space-y-5 border-t border-rule pt-4">
                  <DailyBars
                    label="Messages"
                    unit="sent"
                    days={usage.daily.map((d) => ({ date: d.date, value: d.messages }))}
                  />
                  <DailyBars
                    label="Documents"
                    unit="uploaded"
                    days={usage.daily.map((d) => ({ date: d.date, value: d.documents }))}
                  />
                  <dl className="space-y-1 border-t border-rule pt-3 text-body-sm">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-muted-foreground">Documents, all time</dt>
                      <dd className="figure">{usage.documents_spent}</dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-muted-foreground">Messages, all time</dt>
                      <dd className="figure">{usage.messages_spent}</dd>
                    </div>
                  </dl>
                </div>
              </Section>
            ) : null}

            {dashboard.recent_sessions.length > 0 ? (
              <Section title="Recent chats" action={<SectionLink href="/dashboard/chat">Open chat</SectionLink>}>
                <ul className="divide-y divide-rule border-t border-rule">
                  {dashboard.recent_sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-4 py-2.5">
                      <p className="truncate text-body-sm">{s.title || "New chat"}</p>
                      <span className="figure shrink-0 text-caption text-muted-foreground">
                        {formatDay(s.updated_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

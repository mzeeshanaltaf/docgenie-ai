"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CitationMark, SourceChip } from "@/components/chat/citation-mark";
import { MetricsRow } from "@/components/chat/metrics-row";
import { ReasoningView } from "@/components/chat/reasoning-block";
import { ToolTraceRow } from "@/components/chat/tool-trace";
import type { Citation, MessageMetrics } from "@/types/api";
import { EASE_OUT_EXPO, DURATION } from "@/lib/motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The hero: a replay of one recorded chat turn, built from the same
 * presentational components the real chat uses (ReasoningView, ToolTraceRow,
 * CitationMark, SourceChip, MetricsRow). Everything in it is the verbatim output
 * of one real run (2026-11-12, the real backend and model, a two-page sample
 * contract uploaded by a throwaway user): the question, the reasoning summary,
 * the tool call and its result, the answer, the citation and the metrics. Only
 * the pacing is ours; the replay is sped up.
 *
 * The one orchestrated sequence on the site:
 * question, reasoning, tool call, cited answer, sources, timing, source opens.
 *
 * Content is visible by default. The server render, no-JS, print and reduced
 * motion all show the finished state. The sequence only starts once the client
 * has mounted, the panel is in view and motion is allowed. Only opacity and
 * transform animate.
 */

const QUESTION = "An invoice reaches the client on 3 March. What is the last day it can be paid?";

const REASONING =
  "**Calculating due date**\n\nI need to compute a date that's 30 days from receipt. There's some ambiguity: if the invoice arrives on March 3, then counting from the day after would mean April 2 is the likely due date. The contract specifies that it should be within 30 days of receipt, so March 3 plus 30 days gives April 2, typically excluding the day of receipt. I should cite that March has 31 days, so it's stable.";

const TOOL = {
  name: "search_documents",
  args: {
    query:
      "invoice payment due date number of days after client receives invoice; invoice received March 3 last payment day deadline terms NET days after receipt.",
    document_id: "",
  },
  result: { ok: true, summary: "1 passages from 1 document", duration_ms: 1601 },
};

/** The answer as recorded: Markdown bold on the date, then the citation marker. */
const ANSWER: { text: string; bold?: boolean }[] = [
  { text: "The invoice can be paid through " },
  { text: "2 April", bold: true },
  { text: "—30 days after it is received on 3 March." },
];
const ANSWER_LENGTH = ANSWER.reduce((n, s) => n + s.text.length, 0);
const SNIPPET =
  "SERVICES AGREEMENT 1. Payment. The client shall pay each invoice within 30 days of receipt. 2. Confidentiality. Both parties keep the other's information confidential. 3. Termination. Either party may terminate this agreement by giving 45…";

const CITATION: Citation = {
  index: 1,
  document_id: "recorded",
  file_name: "contract.pdf",
  page_start: 1,
  page_end: 2,
  snippet: SNIPPET,
};

const METRICS: MessageMetrics = {
  ttft_ms: 7350,
  total_ms: 7619,
  output_tokens: 175,
  input_tokens: 2402,
  reasoning_tokens: 95,
  tokens_per_s: 29.1,
  steps: 2,
  tool_calls: 1,
  model: "gpt-6-luna",
  service_tier: "default",
  flex_fallback: false,
};

/**
 * The first `n` characters of the answer visible and the rest laid out but
 * invisible, so streaming never moves the text below it.
 */
function AnswerStream({ n }: { n: number }) {
  let left = n;
  return (
    <>
      {ANSWER.map((seg, i) => {
        const shown = seg.text.slice(0, Math.max(0, left));
        const rest = seg.text.slice(shown.length);
        left -= seg.text.length;
        const Tag = seg.bold ? "strong" : "span";
        return (
          <Tag key={i} className={seg.bold ? "font-semibold" : undefined}>
            {shown}
            {rest && (
              <span aria-hidden className="invisible">
                {rest}
              </span>
            )}
          </Tag>
        );
      })}
    </>
  );
}

/** The sequence, in order. Each stage mounts one more part of the turn. */
const STAGE = {
  reasoning: 1,
  tool: 2,
  toolDone: 3,
  answer: 4,
  sources: 5,
  metrics: 6,
  source: 7,
} as const;
const FINAL = STAGE.source;

/** Milliseconds from the start of a run to each stage. */
const AT = [500, 2800, 4200, 4800, 5900, 6500, 7600] as const;
/** The answer streams in chunks of this many characters. */
const CHUNK = 3;
const CHUNK_MS = 35;

const rise = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0 },
};

function Part({
  children,
  animated,
  className,
}: {
  children: React.ReactNode;
  animated: boolean;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={rise}
      initial={animated ? "hidden" : false}
      animate="shown"
      transition={{ duration: DURATION.reveal, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

export function HeroReplay() {
  const ref = useRef<HTMLDivElement>(null);
  // `reduced` is correct inside effects; `reducedSafe` is for render output.
  const reduced = useReducedMotion();
  const reducedSafe = useReducedMotionSafe();
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const timers = useRef<number[]>([]);

  // Server render, no-JS and reduced motion all land on the finished turn.
  const [stage, setStage] = useState<number>(FINAL);
  const [chars, setChars] = useState(ANSWER_LENGTH);
  const [animated, setAnimated] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(true);

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    clear();
    setAnimated(true);
    setStage(0);
    setChars(0);
    setSourceOpen(false);

    const later = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    AT.forEach((ms, i) => {
      const next = i + 1;
      later(ms, () => {
        setStage(next);
        if (next === STAGE.source) setSourceOpen(true);
        if (next === STAGE.answer) {
          for (let c = CHUNK; c < ANSWER_LENGTH + CHUNK; c += CHUNK) {
            later((c / CHUNK) * CHUNK_MS, () => setChars(Math.min(c, ANSWER_LENGTH)));
          }
        }
      });
    });
  }, [clear]);

  useEffect(() => {
    if (inView && !reduced) play();
    return clear;
  }, [inView, reduced, play, clear]);

  const finished = stage === FINAL;

  return (
    <div ref={ref}>
      <section
        aria-label="Replay of a recorded chat turn"
        className="rounded-lg border border-rule bg-card"
      >
        <div className="flex min-h-11 items-center justify-between gap-4 border-b border-rule px-4">
          <p className="flex min-w-0 items-baseline gap-3">
            <span className="ds-label shrink-0">Recorded run</span>
            <span className="truncate text-body-sm text-muted-foreground">contract.pdf</span>
          </p>
          {!reducedSafe && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={play}
              disabled={!finished}
              className="-mr-2 text-muted-foreground"
            >
              <RotateCcw aria-hidden />
              Replay
            </Button>
          )}
        </div>

        <div className="min-h-[31rem] px-4 pt-5 pb-5 sm:px-5">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-md bg-muted px-4 py-2.5 text-body text-foreground">
              {QUESTION}
            </p>
          </div>

          <div className="mt-6 space-y-0">
            {stage >= STAGE.reasoning && (
              <Part animated={animated}>
                <ReasoningView
                  key={animated ? "live" : "static"}
                  text={REASONING}
                  running={stage >= STAGE.reasoning && stage < STAGE.toolDone}
                />
              </Part>
            )}
            {stage >= STAGE.tool && (
              <Part animated={animated}>
                <ToolTraceRow
                  name={TOOL.name}
                  args={TOOL.args}
                  result={stage >= STAGE.toolDone ? TOOL.result : undefined}
                />
              </Part>
            )}

            {stage >= STAGE.answer && (
              <Part animated={animated} className="pt-4">
                <p className="measure text-body">
                  <AnswerStream n={chars} />
                  {stage >= STAGE.sources && (
                    <CitationMark citation={CITATION} onOpen={() => setSourceOpen((o) => !o)} />
                  )}
                </p>
              </Part>
            )}

            {stage >= STAGE.sources && (
              <Part animated={animated} className="mt-4">
                <p className="ds-label mb-1.5">Sources</p>
                <SourceChip citation={CITATION} onOpen={() => setSourceOpen((o) => !o)} />
              </Part>
            )}

            {stage >= STAGE.metrics && (
              <Part animated={animated} className="mt-4">
                <MetricsRow metrics={METRICS} />
              </Part>
            )}
          </div>

          {/* The source the citation points to. Expands by grid rows, like the
              reasoning block, so no layout property is tweened. */}
          {stage >= STAGE.sources && (
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out-expo",
                sourceOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden" aria-hidden={!sourceOpen}>
                <div className="mt-5 rounded-md border border-rule bg-background p-4">
                  <p className="ds-label mb-3">contract.pdf, pp.1-2</p>
                  <p className="measure text-body-sm text-muted-foreground">
                    <mark className="cite-highlight text-foreground">{SNIPPET}</mark>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="mt-3 text-caption text-muted-foreground">
        A real turn against a two-page sample contract, recorded on 12 November 2026 and sped up.
        The trace and figures are as recorded, on the development setup with a remote database.
      </p>
    </div>
  );
}

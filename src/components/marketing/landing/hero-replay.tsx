"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CitationMark, SourceChip } from "@/components/chat/citation-mark";
import { METRICS_ON_HOVER, MetricsRow } from "@/components/chat/metrics-row";
import {
  ThoughtProcessView,
  thoughtSections,
  type Step,
} from "@/components/chat/thought-process-view";
import type { Citation, MessageMetrics } from "@/types/api";
import { EASE_OUT_EXPO, DURATION } from "@/lib/motion";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The hero: a replay of one recorded chat turn, built from the same
 * presentational components the real chat uses (ThoughtProcessView,
 * CitationMark, SourceChip, MetricsRow). Everything in it is the verbatim output
 * of one real run (2026-11-12, the real backend and model, a two-page sample
 * contract uploaded by a throwaway user): the question, the reasoning summary,
 * the tool call and its result, the answer, the citation and the metrics. Only
 * the pacing is ours; the replay is sped up, and so is its "Thinking" counter,
 * which is scaled to land on the recorded time to first token.
 *
 * The one orchestrated sequence on the site: question, thinking (counter,
 * streamed reasoning, tool call), cited answer, sources, actions, source opens.
 * As in the chat, the thinking block folds to "Thought for …" once the answer
 * starts, and the metrics show only while the answer is hovered.
 *
 * Content is visible by default. The server render, no-JS, print and reduced
 * motion all show the finished state. The sequence only starts once the client
 * has mounted, the panel is in view and motion is allowed. Only opacity and
 * transform animate.
 */

const QUESTION = "An invoice reaches the client on 3 March. What is the last day it can be paid?";
/** The run's date, as the chat stamps a question. Its time of day was not recorded. */
const ASKED_ON = { iso: "2026-11-12", label: "Nov 12, 2026" };

const REASONING =
  "**Calculating due date**\n\nI need to compute a date that's 30 days from receipt. There's some ambiguity: if the invoice arrives on March 3, then counting from the day after would mean April 2 is the likely due date. The contract specifies that it should be within 30 days of receipt, so March 3 plus 30 days gives April 2, typically excluding the day of receipt. I should cite that March has 31 days, so it's stable.";
const THOUGHT = thoughtSections(REASONING)[0];

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
  thinking: 1,
  reasoning: 2,
  tool: 3,
  toolDone: 4,
  answer: 5,
  sources: 6,
  footer: 7,
  source: 8,
} as const;
const FINAL = STAGE.source;

/** Milliseconds from the start of a run to each stage. */
const AT = [400, 1100, 3500, 4800, 5400, 6500, 7000, 7900] as const;
/** The answer streams in chunks of this many characters. */
const CHUNK = 3;
const CHUNK_MS = 35;
/** The reasoning summary streams faster: it is longer and only skimmed. */
const THOUGHT_CHUNK = 7;
const THOUGHT_CHUNK_MS = 30;
/** Replay ms to "recorded" ms for the counter, so it reaches the recorded first token. */
const COUNTER_SCALE = (METRICS.ttft_ms ?? 0) / (AT[STAGE.answer - 1] - AT[STAGE.thinking - 1]);

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
  const [thoughtChars, setThoughtChars] = useState(THOUGHT.body.length);
  const [elapsed, setElapsed] = useState(0);
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
    setThoughtChars(0);
    setElapsed(0);
    setSourceOpen(false);

    const later = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };
    /** Reveals `length` characters in chunks, starting now. */
    const stream = (length: number, chunk: number, every: number, set: (n: number) => void) => {
      for (let c = chunk; c < length + chunk; c += chunk) {
        later((c / chunk) * every, () => set(Math.min(c, length)));
      }
    };

    AT.forEach((ms, i) => {
      const next = i + 1;
      later(ms, () => {
        setStage(next);
        if (next === STAGE.source) setSourceOpen(true);
        if (next === STAGE.reasoning) {
          stream(THOUGHT.body.length, THOUGHT_CHUNK, THOUGHT_CHUNK_MS, setThoughtChars);
        }
        if (next === STAGE.answer) stream(ANSWER_LENGTH, CHUNK, CHUNK_MS, setChars);
      });
    });
  }, [clear]);

  useEffect(() => {
    if (inView && !reduced) play();
    return clear;
  }, [inView, reduced, play, clear]);

  const thinking = stage >= STAGE.thinking && stage < STAGE.answer;

  // The "Thinking" counter, sped up like the rest of the replay.
  useEffect(() => {
    if (!thinking) return;
    const startedAt = Date.now();
    const t = window.setInterval(() => setElapsed((Date.now() - startedAt) * COUNTER_SCALE), 100);
    return () => window.clearInterval(t);
  }, [thinking]);

  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    if (stage >= STAGE.reasoning) {
      out.push({
        kind: "thought",
        key: "thought",
        heading: THOUGHT.heading,
        body: THOUGHT.body.slice(0, thoughtChars),
        streaming: stage < STAGE.tool,
      });
    }
    if (stage >= STAGE.tool) {
      out.push({
        kind: "tool",
        key: "tool",
        name: TOOL.name,
        args: TOOL.args,
        result: stage >= STAGE.toolDone ? TOOL.result : undefined,
      });
    }
    return out;
  }, [stage, thoughtChars]);

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
          <div className="flex flex-col items-end gap-1">
            <time dateTime={ASKED_ON.iso} className="text-caption text-muted-foreground">
              {ASKED_ON.label}
            </time>
            <p className="max-w-[85%] rounded-md bg-muted px-4 py-2.5 text-body text-foreground">
              {QUESTION}
            </p>
          </div>

          {/* `group/answer` reveals the metrics on hover, as in the chat. */}
          <div className="group/answer mt-6 space-y-0">
            {stage >= STAGE.thinking && (
              <Part animated={animated}>
                <ThoughtProcessView
                  steps={steps}
                  active={thinking}
                  elapsedMs={elapsed}
                  thoughtMs={METRICS.ttft_ms}
                  answered={stage >= STAGE.answer}
                />
              </Part>
            )}

            {stage >= STAGE.answer && (
              <Part animated={animated}>
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

            {stage >= STAGE.footer && (
              <Part animated={animated} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* The chat's copy / like / dislike, drawn but inert here. */}
                <div className="-ml-2 flex items-center gap-1 text-muted-foreground" aria-hidden>
                  {[Copy, ThumbsUp, ThumbsDown].map((Icon, i) => (
                    <span key={i} className="flex size-8 items-center justify-center">
                      <Icon className="size-4" />
                    </span>
                  ))}
                </div>
                <MetricsRow metrics={METRICS} variant="inline" className={METRICS_ON_HOVER} />
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

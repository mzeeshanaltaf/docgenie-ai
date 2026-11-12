"use client";

import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { CitationMark } from "@/components/chat/citation-mark";
import { cn } from "@/lib/utils";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion";
import { PIPELINE_STEPS, type PipelineStep } from "./content";
import { Reveal } from "./reveal";

const MARKER = {
  index: 1,
  document_id: "sample",
  file_name: "contract.pdf",
  page_start: 1,
  page_end: 2,
  snippet: "",
};

function Step({ step, index }: { step: PipelineStep; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  // Becomes true once the step has crossed the middle of the viewport and stays
  // true, so the rail reads as progress made.
  const reached = useInView(ref, { once: true, margin: "0px 0px -45% 0px" });
  const isLast = index === PIPELINE_STEPS.length - 1;

  return (
    <li ref={ref} className="relative grid grid-cols-[1.5rem_1fr] gap-x-4 pb-12 last:pb-0 sm:gap-x-6">
      {/* The node sits on the rail. Filled once the scroll has reached it. */}
      <span
        aria-hidden
        className={cn(
          "relative z-10 mt-2 size-3 justify-self-center rounded-xs border transition-colors duration-300 ease-out-quart",
          reached ? "border-foreground bg-foreground" : "border-rule-strong bg-background"
        )}
      />
      <Reveal>
        <div className="flex items-baseline gap-3">
          <span className="figure text-body-sm text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="text-headline">{step.name}</h3>
        </div>
        <p className="measure mt-2 text-body text-muted-foreground">
          {step.body}
          {isLast && (
            <>
              {" "}
              <CitationMark citation={MARKER} />
            </>
          )}
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-3">
          {step.figures.map((f) => (
            <div key={f.label}>
              <dt className="ds-label">{f.label}</dt>
              <dd className="figure text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </li>
  );
}

/**
 * The five stages as a scroll-driven diagram. A rail runs down the left; its
 * ink fill is tied to scroll progress through the list (transform only), and
 * each step appears in the order the machinery runs. Under reduced motion the
 * rail is simply full and the steps are plain.
 */
export function Pipeline() {
  const listRef = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotionSafe();
  const { scrollYProgress } = useScroll({
    target: listRef,
    offset: ["start 65%", "end 55%"],
  });
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <ol ref={listRef} className="relative">
      {/* Rail: a hairline track, and an ink fill that grows with scroll. The
          track runs from the first node to the last. */}
      <span
        aria-hidden
        className="absolute top-4 bottom-4 left-3 w-px -translate-x-1/2 bg-rule-strong"
      />
      <motion.span
        aria-hidden
        className="absolute top-4 bottom-4 left-3 w-px origin-top -translate-x-1/2 bg-foreground"
        style={{ scaleY: reduced ? 1 : fill }}
      />
      {PIPELINE_STEPS.map((step, i) => (
        <Step key={step.id} step={step} index={i} />
      ))}
    </ol>
  );
}

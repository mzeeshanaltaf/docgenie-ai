import type { MessageMetrics } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * Hides the inline metrics until the enclosing `group/answer` is hovered or
 * has keyboard focus. Keyboard focus only: a mouse click (e.g. on "Thought
 * for") also focuses, and that focus would keep the metrics up after the
 * pointer leaves.
 */
export const METRICS_ON_HOVER =
  "opacity-0 transition-opacity duration-150 group-hover/answer:opacity-100 group-has-focus-visible/answer:opacity-100";

const fmtMs =(ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

function metricItems(metrics: MessageMetrics): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  if (metrics.ttft_ms != null) items.push({ label: "First token", value: fmtMs(metrics.ttft_ms) });
  items.push({ label: "Total", value: fmtMs(metrics.total_ms) });
  if (metrics.tokens_per_s != null) {
    items.push({ label: "Tokens/s", value: metrics.tokens_per_s.toFixed(1) });
  }
  return items;
}

/**
 * Timing and token counts for one answer. Presentational and free of
 * assistant-ui, so static data can drive it (the landing replay) and so it
 * stays out of the landing bundle's chat runtime.
 *
 * - `stacked` (default): the figure row of DESIGN.md, legend label over a mono figure.
 * - `inline`: one line of "label value" pairs set like the question timestamp
 *   (caption, muted), for the chat footer next to the actions.
 */
export function MetricsRow({
  metrics,
  variant = "stacked",
  className,
}: {
  metrics: MessageMetrics;
  variant?: "stacked" | "inline";
  className?: string;
}) {
  const items = metricItems(metrics);
  if (variant === "inline") {
    return (
      <dl
        aria-label="Answer metrics"
        className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground", className)}
      >
        {items.map((it) => (
          <div key={it.label} className="flex gap-1 whitespace-nowrap">
            <dt>{it.label}</dt>
            {/* Set exactly like the question's date: no mono `figure`, no tabular digits. */}
            <dd>{it.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className={cn("flex flex-wrap gap-x-5 gap-y-1", className)}>
      {items.map((it) => (
        <div key={it.label}>
          <dt className="ds-label">{it.label}</dt>
          <dd className="figure text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

import type { MessageMetrics } from "@/types/api";

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/**
 * The figure row (DESIGN.md): legend label over a mono figure. Timing and token
 * counts for one answer. Presentational and free of assistant-ui, so static data
 * can drive it (the landing replay) and so it stays out of the landing bundle's
 * chat runtime.
 */
export function MetricsRow({ metrics }: { metrics: MessageMetrics }) {
  const items: { label: string; value: string }[] = [];
  if (metrics.ttft_ms != null) items.push({ label: "First token", value: fmtMs(metrics.ttft_ms) });
  items.push({ label: "Total", value: fmtMs(metrics.total_ms) });
  if (metrics.tokens_per_s != null) {
    items.push({ label: "Tokens/s", value: metrics.tokens_per_s.toFixed(1) });
  }
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="ds-label">{it.label}</dt>
          <dd className="figure text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

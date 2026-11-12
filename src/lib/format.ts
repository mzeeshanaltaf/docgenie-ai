/**
 * Display formatting shared by the app surfaces. Figures are set in the mono
 * (`figure` utility) by the caller; these only produce the strings.
 */

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** `12 Nov` */
export function formatDay(iso: string): string {
  return DAY_MONTH.format(new Date(iso));
}

/** `12 Nov 2026` */
export function formatDate(iso: string): string {
  return DAY_MONTH_YEAR.format(new Date(iso));
}

/** `12 Nov 14:05` */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${DAY_MONTH.format(d)} ${TIME.format(d)}`;
}

const MESSAGE_STAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** `Nov 5, 2026, 9:09 PM`: the stamp over a chat question and on liked answers. */
export function formatMessageStamp(date: Date): string {
  return MESSAGE_STAMP.format(date);
}

/** `412 B`, `38.2 KB`, `4.7 MB` */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `+2` / `-1` / `0`, with a real minus sign so it reads as a figure. */
export function formatDelta(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

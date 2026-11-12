/**
 * Locating a cited passage in a document's text.
 *
 * A citation carries the first ~240 characters of a chunk, whitespace-collapsed
 * by the backend. The viewer's text comes from a different extractor (pdf.js, or
 * the raw file), so spacing, hyphenation and line breaks differ. Matching is
 * therefore done on letters and digits only, case-folded; `map[i]` says which
 * original character each normalised character came from.
 */

const KEEP = /[\p{L}\p{N}]/u;

export type Normalised = { text: string; map: number[] };

export function normalise(source: string): Normalised {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (KEEP.test(ch)) {
      text += ch.toLowerCase();
      map.push(i);
    }
  }
  return { text, map };
}

/** Prefix lengths tried, longest first, when the whole snippet is not found. */
const PREFIX_STEPS = [Infinity, 160, 100, 60, 40, 28];
const MIN_LEN = 20;

/**
 * Finds the snippet (or its longest findable prefix) in `hay`. Returns the range
 * in normalised coordinates, or null if even a short prefix is absent.
 */
export function findSnippet(
  hay: Normalised,
  snippet: string
): { start: number; end: number } | null {
  const needle = normalise(snippet).text;
  if (needle.length < MIN_LEN) return null;
  for (const step of PREFIX_STEPS) {
    const len = Math.min(needle.length, step);
    if (len < MIN_LEN) break;
    const probe = needle.slice(0, len);
    const at = hay.text.indexOf(probe);
    if (at !== -1) return { start: at, end: at + probe.length };
  }
  return null;
}

/** Range in the original string covered by a normalised range. */
export function toSourceRange(
  hay: Normalised,
  range: { start: number; end: number }
): { start: number; end: number } {
  return { start: hay.map[range.start], end: hay.map[range.end - 1] + 1 };
}

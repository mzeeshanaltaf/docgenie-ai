/**
 * Locating a cited passage in a document's text.
 *
 * A citation carries the passage the answer relied on (one to a few sentences,
 * whitespace-collapsed by the backend; see backend/app/services/citations.py).
 * The viewer's text comes from a different extractor (pdf.js, or the raw file),
 * so spacing, hyphenation, ligatures and line breaks differ. Matching is
 * therefore done on letters and digits only, NFKC-folded (so "ﬁ" is "fi") and
 * lower-cased; `map[i]` says which original character each normalised character
 * came from.
 */

const KEEP = /[\p{L}\p{N}]/u;

export type Normalised = { text: string; map: number[] };

export function normalise(source: string): Normalised {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < source.length; ) {
    const ch = String.fromCodePoint(source.codePointAt(i)!);
    for (const c of ch.normalize("NFKC")) {
      if (!KEEP.test(c)) continue;
      const low = c.toLowerCase();
      text += low;
      for (let k = 0; k < low.length; k++) map.push(i);
    }
    i += ch.length;
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

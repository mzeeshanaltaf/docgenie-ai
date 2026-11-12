/**
 * Motion tokens for the `motion` library. Mirrors the CSS tokens in
 * globals.css (--ease-out-expo, --ease-out-quart) and the rules in DESIGN.md.
 *
 * Rules that apply to every use:
 * - Animate opacity and transform only, never width/height/top/left/margin.
 * - Content is visible by default. A reveal may start from `hidden` only when
 *   it is driven by `whileInView`/`animate`, so a failed script or reduced
 *   motion leaves the content on screen.
 * - No bounce or elastic easing.
 */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

/** Seconds. State changes in the app stay inside 0.15 to 0.25. */
export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.25,
  /** Scroll reveals and the hero sequence only (marketing). */
  reveal: 0.6,
} as const;

/** Standard transition for app state changes (hover, select, expand). */
export const stateTransition = {
  duration: DURATION.base,
  ease: EASE_OUT_EXPO,
} as const;

/** A small rise-and-fade reveal. Spread onto a `motion.*` element. */
export const reveal = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-10% 0px" },
  transition: { duration: DURATION.reveal, ease: EASE_OUT_EXPO },
} as const;

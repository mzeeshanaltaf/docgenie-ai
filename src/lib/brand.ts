/**
 * Brand constants for places that cannot read CSS variables: generated images
 * (icon, apple-icon, opengraph-image run through Satori, which has no oklch),
 * the `theme-color` meta tag and public/logo.svg.
 *
 * Every hex value is the sRGB rendering of a token in src/app/globals.css
 * (light values unless marked dark). If a token changes there, change it here,
 * and in public/logo.svg.
 */
export const BRAND_HEX = {
  paper: "#f8fafd", // oklch(0.985 0.004 250)
  paperDark: "#0b1016", // oklch(0.17 0.015 255)
  ink: "#111820", // oklch(0.205 0.02 255)
  inkSoft: "#555e6a", // oklch(0.48 0.022 255)
  rule: "#d8dde2", // oklch(0.895 0.008 250)
  vermilion: "#c8340e", // oklch(0.55 0.19 34)
  vermilionTint: "#ffe9e4", // oklch(0.95 0.025 34)
} as const;

/**
 * The mark: a ruled square holding three lines of text, the last one short.
 * 20 x 20 grid. `Wordmark` draws it with `currentColor`; the generated icons
 * draw the same geometry reversed (paper lines on an ink square).
 */
export const LOGO_MARK = {
  viewBox: 20,
  frame: { x: 1, y: 1, size: 18, radius: 2 },
  lines: ["M6 7h8", "M6 10h8", "M6 13h4"],
  strokeWidth: 1.5,
} as const;

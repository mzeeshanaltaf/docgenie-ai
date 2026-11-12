export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The old DM Serif Display font was dropped with the Phase 6 design system.
  // Marketing pages still reference `var(--font-display)` in inline styles;
  // `--font-display` is aliased to the sans in globals.css until Phase 9
  // rewrites those pages.
  return <>{children}</>;
}

/** Small pieces every auth form shares, so the four screens read as one. */

/** Inline link: the accent marks it as something you can act on. */
export const authLinkClass =
  "rounded-sm font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Left-aligned page title and one supporting sentence. */
export function AuthHeading({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-headline">{title}</h1>
      <p className="mt-1.5 text-body-sm text-muted-foreground">{children}</p>
    </div>
  );
}

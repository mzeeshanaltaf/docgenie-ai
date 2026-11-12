import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Layout primitives for the signed-in app surfaces (Overview, Documents,
 * Settings). They carry the same grid language as the landing page: the
 * `page-container` frame, hairline rules for structure, left alignment.
 * No hooks beyond `useId`, so they work in server and client components.
 */

/** The page frame: max width, gutters and vertical padding. */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-container py-6 md:py-8", className)}>{children}</div>
  );
}

/** Page title row: headline on the left, page actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6 md:pb-8",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-headline text-balance">{title}</h1>
        {description ? (
          <p className="measure mt-1 text-body-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * A ruled section: one heavier hairline carries the heading, content sits on
 * the paper below it. Replaces the card for most grouping (DESIGN.md, Panels).
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("border-t border-rule-strong", className)}>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <h2 id={id} className="text-title">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

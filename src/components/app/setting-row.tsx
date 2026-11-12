import { cn } from "@/lib/utils";

/**
 * A settings row on the 12-column grid: the name and its explanation on the
 * left, the control on the right, one hairline above. Rows are never boxed.
 */
export function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-grid gap-y-4 border-t border-rule py-6", className)}>
      <div className="col-span-4 md:col-span-5 lg:col-span-4">
        <h3 className="text-title">{title}</h3>
        {description ? (
          <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="col-span-4 min-w-0 md:col-span-7 lg:col-span-6 lg:col-start-6">{children}</div>
    </div>
  );
}

/** Label above a control, 13px medium. Never a placeholder. */
export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-body-sm font-medium">
      {children}
    </label>
  );
}

import { PageShell } from "@/components/app/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <PageShell>
      <div className="pb-8">
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex gap-6 border-b border-rule pb-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-5 w-16" />
        ))}
      </div>
      <div className="space-y-4 py-6">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-9 w-72 max-w-full" />
      </div>
    </PageShell>
  );
}

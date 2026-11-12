import { PageShell } from "@/components/app/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <PageShell>
      <div className="space-y-2 pb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="mt-6 space-y-px">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </PageShell>
  );
}

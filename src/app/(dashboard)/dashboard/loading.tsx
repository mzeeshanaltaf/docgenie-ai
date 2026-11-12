import { PageShell } from "@/components/app/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageShell>
      <div className="space-y-2 pb-8">
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="page-grid gap-y-10">
        <div className="col-span-4 md:col-span-12 lg:col-span-7">
          <div className="border-t border-rule-strong pt-3">
            <Skeleton className="mb-4 h-5 w-40" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between border-b border-rule py-2.5">
                <Skeleton className="h-4 w-48 max-w-[60%]" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-4 md:col-span-12 lg:col-span-4 lg:col-start-9">
          <div className="border-t border-rule-strong pt-3">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

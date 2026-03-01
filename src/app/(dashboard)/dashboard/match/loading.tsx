import { Skeleton } from "@/components/ui/skeleton";

export default function MatchLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="rounded-lg border border-border bg-background p-6 space-y-8">
        {/* Stepper */}
        <div className="flex items-center gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-4 w-20" />
              {i < 3 && <Skeleton className="h-px w-10" />}
            </div>
          ))}
        </div>

        {/* Resume grid placeholder */}
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
    </div>
  );
}

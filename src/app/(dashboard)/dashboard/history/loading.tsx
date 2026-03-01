import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Filter */}
      <Skeleton className="h-9 w-72 rounded-md" />

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex gap-4">
          {["w-32", "w-48", "w-20", "w-24", "w-16"].map((w, i) => (
            <Skeleton key={i} className={`h-4 ${w}`} />
          ))}
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="border-b border-border last:border-0 px-4 py-4 flex gap-4 items-center">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

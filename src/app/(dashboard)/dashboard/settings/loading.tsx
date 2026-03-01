import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-md" />
        ))}
      </div>

      {/* Content placeholder */}
      <div className="space-y-4 max-w-xl">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

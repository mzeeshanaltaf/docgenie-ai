import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-lg border border-border overflow-hidden">
      <div className="hidden w-64 shrink-0 border-r border-border p-3 space-y-2 md:block">
        <Skeleton className="h-9 w-full" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="mt-4 h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden">
      <div className="hidden w-64 shrink-0 space-y-2 border-r border-rule p-3 md:block">
        <Skeleton className="h-9 w-full" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1" />
    </div>
  );
}

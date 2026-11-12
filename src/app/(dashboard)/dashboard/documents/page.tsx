"use client";

import { useDashboardData } from "@/contexts/dashboard-data";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, PageShell } from "@/components/app/page-shell";
import { ViewerProvider } from "@/components/chat/viewer-context";
import { ViewerDock } from "@/components/chat/viewer-dock";
import { DocumentUpload } from "@/components/dashboard/documents/document-upload";
import { DocumentList } from "@/components/dashboard/documents/document-list";
import { useUploadQueue } from "@/components/dashboard/documents/use-upload-queue";

function DocumentsSkeleton() {
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

function DocumentsContent() {
  const { items, addFiles, retry, dismiss } = useUploadQueue();
  return (
    <PageShell>
      <PageHeader
        title="Documents"
        description="Each upload uses one document credit. A document that fails to process gets its credit back."
      />
      <div className="space-y-6">
        <DocumentUpload onFiles={addFiles} />
        <DocumentList uploads={items} onRetryUpload={retry} onDismissUpload={dismiss} />
      </div>
    </PageShell>
  );
}

export default function DocumentsPage() {
  const { loading } = useDashboardData();
  if (loading) return <DocumentsSkeleton />;

  return (
    <ViewerProvider>
      <div className="flex">
        <div className="min-w-0 flex-1">
          <DocumentsContent />
        </div>
        <ViewerDock asideClassName="sticky top-0 h-[calc(100dvh-3.5rem)] self-start" />
      </div>
    </ViewerProvider>
  );
}

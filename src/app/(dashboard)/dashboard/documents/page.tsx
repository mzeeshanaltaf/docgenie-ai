"use client";

import { useDashboardData } from "@/contexts/dashboard-data";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentUpload } from "@/components/dashboard/documents/document-upload";
import { DocumentList } from "@/components/dashboard/documents/document-list";

export default function DocumentsPage() {
  const { loading } = useDashboardData();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage your documents. Each upload uses 1 credit.
        </p>
      </div>

      <DocumentUpload />

      <div>
        <h2 className="mb-4 text-lg font-semibold">Your Documents</h2>
        <DocumentList />
      </div>
    </div>
  );
}

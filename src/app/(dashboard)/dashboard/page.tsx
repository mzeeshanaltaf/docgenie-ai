"use client";

import { useUser } from "@clerk/nextjs";
import { useDashboardData } from "@/contexts/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  FileText,
  Zap,
  MessageSquare,
  ArrowRight,
  Upload,
} from "lucide-react";
import type { ChatSession } from "@/types/n8n";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const { user } = useUser();
  const { analytics, chatSessions, loading } = useDashboardData();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-6 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalDocuments = analytics?.total_documents_processed ?? 0;
  const creditBalance = analytics?.credit_balance ?? 0;
  const messageBalance = analytics?.message_balance ?? 0;

  const recentSessions: ChatSession[] = chatSessions
    ? [...chatSessions].slice(0, 5)
    : [];

  const stats = [
    {
      label: "Documents Processed",
      value: String(totalDocuments),
      icon: FileText,
    },
    {
      label: "Credits Remaining",
      value: String(creditBalance),
      icon: Zap,
    },
    {
      label: "Messages Remaining",
      value: String(messageBalance),
      icon: MessageSquare,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.firstName ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s an overview of your document activity.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent chat sessions or empty state */}
      {recentSessions.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Chats</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/chat">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {recentSessions.map((session, i) => (
                <li
                  key={session.session_id ?? i}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {session.chat_title || "Untitled Chat"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.messages?.length ?? 0} message{(session.messages?.length ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">
                      {session.messages?.[0]?.created_at
                        ? formatDate(session.messages[0].created_at)
                        : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Upload className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-semibold">
              Upload your first document
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Upload a PDF, Word doc, text file, or CSV and start asking
              questions. DocGenie will read and answer instantly.
            </p>
            <div className="flex items-center gap-2">
              <Button
                asChild
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
              >
                <Link href="/dashboard/documents">
                  Upload document <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <Badge variant="secondary" className="mt-4">
              Free · 5 document credits + 25 messages
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

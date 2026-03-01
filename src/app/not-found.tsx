import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileSearch } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
        <FileSearch className="h-10 w-10 text-emerald-500" />
      </div>
      <h1 className="mb-2 text-6xl font-bold tracking-tight">404</h1>
      <h2 className="mb-3 text-xl font-semibold">Page not found</h2>
      <p className="mb-8 max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Button
          asChild
          className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

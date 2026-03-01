"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ResumeMatchResponse } from "@/types/n8n";

interface JdInputProps {
  fileId: string;
  onBack: () => void;
  onResults: (result: ResumeMatchResponse) => void;
}

export function JdInput({ fileId, onBack, onResults }: JdInputProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");

  async function analyze() {
    if (!url.trim()) {
      toast.error("Please enter a job posting URL.");
      return;
    }

    // Basic URL validation
    try {
      new URL(url.trim());
    } catch {
      toast.error("Please enter a valid URL.");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Scrape the JD
      setStatusText("Analyzing job description…");
      const jdRes = await fetch("/api/jd/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!jdRes.ok) throw new Error("Failed to process job description.");
      const { url_id } = await jdRes.json();

      // Step 2: Run the match
      setStatusText("Matching your resume…");
      const matchRes = await fetch("/api/match/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, url_id }),
      });
      if (!matchRes.ok) throw new Error("Match analysis failed.");
      const result = await matchRes.json();

      toast.success("Analysis complete!");
      onResults(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Add job description</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the URL of the job posting you want to match against.
        </p>
      </div>

      {/* Tab shell — URL active, Paste Text placeholder */}
      <div className="flex gap-1 rounded-lg border border-border p-1 w-fit bg-muted/30">
        <span className="rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm">
          Job URL
        </span>
        <span className="px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed" title="Coming soon">
          Paste text
        </span>
      </div>

      <div className="space-y-3">
        <Input
          type="url"
          placeholder="https://company.com/careers/job-title"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          disabled={loading}
          className="max-w-lg"
        />

        {loading && statusText && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {statusText}
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={loading} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={analyze}
          disabled={loading || !url.trim()}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Analyze match</>
          )}
        </Button>
      </div>
    </div>
  );
}

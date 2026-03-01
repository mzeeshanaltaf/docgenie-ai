import { MatchStepper } from "@/components/dashboard/match/match-stepper";

export default function MatchPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Fit Analysis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Match your resume against a job description to get a comprehensive
          fit score, keyword analysis, and tailored recommendations.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-6">
        <MatchStepper />
      </div>
    </div>
  );
}

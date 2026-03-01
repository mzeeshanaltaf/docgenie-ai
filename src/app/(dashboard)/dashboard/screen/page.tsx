import { ScreenStepper } from "@/components/dashboard/screen/screen-stepper";

export default function ScreenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Resume Screener</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Screen multiple resumes against a job description. Get quick scores
          to shortlist the best candidates.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-6">
        <ScreenStepper />
      </div>
    </div>
  );
}

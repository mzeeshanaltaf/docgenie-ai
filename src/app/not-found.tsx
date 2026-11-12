import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarketingPage } from "@/components/marketing/marketing-page";

export default function NotFound() {
  return (
    <MarketingPage>
      <div className="page-container pt-16 pb-32 md:pt-24 md:pb-40">
        <div className="page-grid gap-y-6">
          <div className="col-span-4 md:col-span-12 lg:col-span-7">
            <p className="ds-label">Error 404</p>
            <h1 className="mt-3 text-section text-balance">There is no page at this address.</h1>
            <p className="measure mt-4 max-w-sm text-body text-muted-foreground">
              The link may be out of date or mistyped. The pages that do exist are one click away.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/">Back to the home page</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard">Open the dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}

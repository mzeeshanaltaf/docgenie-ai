import type { Metadata } from "next";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopNav } from "@/components/dashboard/top-nav";
import { DashboardDataProvider } from "@/contexts/dashboard-data";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardDataProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-[3px] focus:ring-ring/50"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopNav />
          <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto bg-background outline-none">
            {children}
          </main>
        </div>
      </div>
    </DashboardDataProvider>
  );
}

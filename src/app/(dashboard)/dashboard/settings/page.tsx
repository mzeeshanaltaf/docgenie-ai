"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, PageShell } from "@/components/app/page-shell";
import { AccountSection } from "@/components/dashboard/settings/account-section";
import { CreditsSection } from "@/components/dashboard/settings/credits-section";
import { ProfileSection } from "@/components/dashboard/settings/profile-section";

export default function SettingsPage() {
  return (
    <PageShell>
      <PageHeader title="Settings" />

      <Tabs defaultValue="profile" className="gap-0">
        <TabsList
          variant="line"
          aria-label="Settings sections"
          className="h-auto w-full justify-start gap-6 rounded-none border-b border-rule p-0"
        >
          <TabsTrigger value="profile" className="flex-none px-0 pb-3 group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]">
            Profile
          </TabsTrigger>
          <TabsTrigger value="credits" className="flex-none px-0 pb-3 group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]">
            Credits
          </TabsTrigger>
          <TabsTrigger value="account" className="flex-none px-0 pb-3 group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]">
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="credits">
          <CreditsSection />
        </TabsContent>
        <TabsContent value="account">
          <AccountSection />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

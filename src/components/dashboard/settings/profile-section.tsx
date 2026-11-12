"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldLabel, SettingRow } from "@/components/app/setting-row";

/** Does this account sign in with a password? (Google-only accounts do not.) null while unknown. */
export function useHasPassword(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    authClient
      .listAccounts()
      .then(({ data }) => {
        if (!cancelled) setHas(Array.isArray(data) ? data.some((a) => a.providerId === "credential") : null);
      })
      .catch(() => {
        if (!cancelled) setHas(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return has;
}

export function ProfileSection() {
  const { data: session, isPending, refetch } = useSession();
  const user = session?.user;
  const hasPassword = useHasPassword();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Seed the name field once the session resolves.
  const displayName = name || user?.name || "";

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    const next = (name || user?.name || "").trim();
    if (!next) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await authClient.updateUser({ name: next });
      if (error) {
        toast.error(error.message || "Could not update your name.");
        return;
      }
      toast.success("Profile updated.");
      refetch?.();
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        toast.error(error.message || "Could not change the password.");
        return;
      }
      toast.success("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setSavingPassword(false);
    }
  }

  if (isPending) {
    return (
      <div className="space-y-6 border-t border-rule py-6">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-9 w-72 max-w-full" />
      </div>
    );
  }

  return (
    <div>
      <SettingRow title="Name and email" description="Your name appears in the dashboard greeting.">
        <form onSubmit={handleSaveName} className="max-w-sm space-y-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input id="profile-email" type="email" value={user?.email ?? ""} disabled />
            <p className="text-caption text-muted-foreground">The email address cannot be changed.</p>
          </div>
          <Button type="submit" disabled={savingName}>
            {savingName ? <Loader2 aria-hidden className="animate-spin" /> : null}
            Save name
          </Button>
        </form>
      </SettingRow>

      <SettingRow
        title="Password"
        description="Changing it signs you out of your other devices."
      >
        {hasPassword === false ? (
          <p className="measure text-body-sm text-muted-foreground">
            This account signs in with Google, so there is no password to change.
          </p>
        ) : (
          <form onSubmit={handleChangePassword} className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="current-password">Current password</FieldLabel>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="text-caption text-muted-foreground">At least 8 characters.</p>
            </div>
            <Button type="submit" variant="outline" disabled={savingPassword}>
              {savingPassword ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Update password
            </Button>
          </form>
        )}
      </SettingRow>
    </div>
  );
}

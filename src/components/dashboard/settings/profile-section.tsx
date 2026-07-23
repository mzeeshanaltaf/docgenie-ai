"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function ProfileSection() {
  const { data: session, isPending, refetch } = useSession();
  const user = session?.user;

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
        toast.error(
          error.message ||
            "Could not change password. If you signed up with Google, you don't have a password."
        );
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="profile-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="profile-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="profile-email"
                type="email"
                value={user?.email ?? ""}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>
            <Button
              type="submit"
              disabled={savingName}
              className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
            >
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="current-password" className="text-sm font-medium">
                Current password
              </label>
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
              <label htmlFor="new-password" className="text-sm font-medium">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={savingPassword}>
              {savingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

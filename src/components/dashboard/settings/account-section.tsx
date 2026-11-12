"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel, SettingRow } from "@/components/app/setting-row";
import { useHasPassword } from "./profile-section";
import type { ApiErrorBody } from "@/types/api";

/** The word the user types to confirm deleting the account. */
const CONFIRM_WORD = "DELETE";

function filenameFrom(res: Response): string {
  const header = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match?.[1] ?? "docgenie-export.zip";
}

function ExportRow() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        setError(
          body?.status === "STORAGE_UNAVAILABLE"
            ? "Your files could not be read just now, so no export was made. Try again in a moment."
            : body?.message || "The export could not be made. Try again."
        );
        return;
      }
      // A zip can be large: save it from a blob URL rather than rendering it.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFrom(res);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Export downloaded");
    } catch {
      setError("The export could not be downloaded. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingRow
      title="Export your data"
      description="A zip file with your original documents and JSON files for documents, chats, feedback and credit history."
    >
      <Button type="button" variant="outline" onClick={handleExport} disabled={busy} aria-busy={busy}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}
        {busy ? "Preparing export" : "Download export"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-body-sm text-destructive">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </SettingRow>
  );
}

function DeleteRow() {
  const router = useRouter();
  const hasPassword = useHasPassword();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFreshSignIn, setNeedsFreshSignIn] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const confirmed = phrase === CONFIRM_WORD && (hasPassword === false || password.length > 0);

  function close() {
    setOpen(false);
    setPhrase("");
    setPassword("");
    setError(null);
    setNeedsFreshSignIn(false);
    setPasswordInvalid(false);
    triggerRef.current?.focus();
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    setPasswordInvalid(false);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(hasPassword ? { password } : {}),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        if (body?.status === "SESSION_EXPIRED") {
          setNeedsFreshSignIn(true);
          setError("For your security, sign in again first. Then come back here to delete the account.");
        } else if (body?.status === "INVALID_PASSWORD") {
          setPasswordInvalid(true);
          setError("That password is not correct. Nothing was deleted.");
        } else if (res.status === 503 || res.status === 502 || res.status === 504) {
          setError("Your files could not be removed just now, so the account is still active. Try again in a moment.");
        } else {
          setError(body?.message || "The account could not be deleted. Nothing was removed.");
        }
        return;
      }

      // The server has removed the data and cleared the session cookie. Clear
      // the client's session state too, then leave with a full navigation so
      // no dashboard request can run for the deleted user.
      try {
        await authClient.signOut();
      } catch {
        // Already signed out server-side.
      }
      window.location.assign("/");
    } catch {
      setError("The server could not be reached, so nothing was deleted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInAgain() {
    await authClient.signOut().catch(() => {});
    router.push("/sign-in?redirect=/dashboard/settings");
  }

  return (
    <SettingRow
      title="Delete account"
      description="Removes your login and everything stored for it. This cannot be undone."
    >
      {!open ? (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 aria-hidden /> Delete account
        </Button>
      ) : (
        <form onSubmit={handleDelete} className="max-w-sm space-y-4">
          <div>
            <p className="text-body-sm font-medium">This deletes</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body-sm text-muted-foreground">
              <li>every uploaded document and its indexed text</li>
              <li>all chats, answers and feedback</li>
              <li>your credit balance and history</li>
              <li>your sign-in, including any Google link</li>
            </ul>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Download an export first if you want to keep anything.
            </p>
          </div>

          {hasPassword ? (
            <div className="space-y-1.5">
              <FieldLabel htmlFor="delete-password">Your password</FieldLabel>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={busy}
                aria-invalid={passwordInvalid ? true : undefined}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <FieldLabel htmlFor="delete-confirm">
              Type <span className="figure">{CONFIRM_WORD}</span> to confirm
            </FieldLabel>
            <Input
              id="delete-confirm"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              className="figure"
            />
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-body-sm text-destructive">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {needsFreshSignIn ? (
              <Button type="button" onClick={signInAgain}>
                Sign in again
              </Button>
            ) : (
              <Button type="submit" variant="destructive" disabled={!confirmed || busy} aria-busy={busy}>
                {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
                {busy ? "Deleting" : "Delete account permanently"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SettingRow>
  );
}

export function AccountSection() {
  return (
    <div>
      <ExportRow />
      <DeleteRow />
    </div>
  );
}

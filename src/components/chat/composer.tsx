"use client";

import Link from "next/link";
import { ArrowUp, Square } from "lucide-react";
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/dashboard-data";
import { DocumentPicker } from "./document-picker";

/** Message box: input, document scope, send / stop, and the no-credits state. */
export function Composer() {
  const { messageBalance, documents } = useDashboardData();
  const noCredits = messageBalance !== null && messageBalance <= 0;
  const noDocuments = documents !== null && documents.every((d) => d.status !== "ready");

  return (
    <div className="border-t border-rule bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-3">
        {noCredits && (
          <p
            role="alert"
            className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border border-destructive/40 bg-card px-3 py-2 text-body-sm"
          >
            <span className="font-semibold text-foreground">No message credits left.</span>
            <span className="text-muted-foreground">
              Questions are not sent until you have credits.
            </span>
            <Link href="/dashboard/settings" className="text-brand underline underline-offset-4">
              View credits
            </Link>
          </p>
        )}
        <ComposerPrimitive.Root className="rounded-lg border border-border bg-card p-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <ComposerPrimitive.Input
            rows={1}
            maxRows={8}
            disabled={noCredits}
            placeholder={
              noCredits
                ? "No message credits left"
                : noDocuments
                  ? "Upload a document to ask about it"
                  : "Ask about your documents"
            }
            aria-label="Message"
            className="block max-h-48 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-body text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2">
            <DocumentPicker />
            <div>
              <AuiIf condition={(s) => !s.thread.isRunning}>
                <ComposerPrimitive.Send asChild>
                  <Button type="submit" size="icon-sm" disabled={noCredits} aria-label="Send message">
                    <ArrowUp aria-hidden />
                  </Button>
                </ComposerPrimitive.Send>
              </AuiIf>
              <AuiIf condition={(s) => s.thread.isRunning}>
                <ComposerPrimitive.Cancel asChild>
                  <Button type="button" size="icon-sm" variant="outline" aria-label="Stop generating">
                    <Square className="fill-current" aria-hidden />
                  </Button>
                </ComposerPrimitive.Cancel>
              </AuiIf>
            </div>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
}

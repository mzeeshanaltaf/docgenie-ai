"use client";

import { useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DocumentViewer } from "./document-viewer";
import { useViewer } from "./viewer-context";

/** True from the `lg` breakpoint up, where the viewer docks beside the page. */
export function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}

/**
 * The source viewer, docked from `lg` up and in a sheet below. Shared by the
 * chat screen and the document list so a source looks the same wherever it opens.
 * Render it as the last child of a flex row; `asideClassName` positions the dock.
 */
export function ViewerDock({ asideClassName }: { asideClassName?: string }) {
  const { target, close } = useViewer();
  const desktop = useIsDesktop();

  return (
    <>
      {target && desktop && (
        <aside className={cn("w-[min(40rem,46%)] shrink-0 border-l border-rule", asideClassName)}>
          <DocumentViewer target={target} onClose={close} />
        </aside>
      )}
      {!desktop && (
        <Sheet open={target !== null} onOpenChange={(o) => !o && close()}>
          <SheetContent side="right" showCloseButton={false} className="w-full max-w-none p-0 sm:max-w-xl">
            <SheetTitle className="sr-only">Source document</SheetTitle>
            {target && <DocumentViewer target={target} onClose={close} />}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

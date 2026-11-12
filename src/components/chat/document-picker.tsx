"use client";

import { useMemo } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { useAuiState } from "@assistant-ui/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDashboardData } from "@/contexts/dashboard-data";
import {
  rememberSession,
  setSelection,
  useSessionSelection,
} from "@/lib/chat/session-store";
import type { SessionOut } from "@/types/api";

/**
 * Chooses which documents this chat can search: all of them, or a selection.
 * An existing chat saves the choice at once (`PATCH /api/sessions/{id}`). A new
 * chat has no server record yet, so the choice is held as a draft and travels
 * with its first message.
 */
export function DocumentPicker() {
  const { documents } = useDashboardData();
  const localId = useAuiState((s) => s.threadListItem.id);
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const selection = useSessionSelection(remoteId, localId);

  const ready = useMemo(
    () => (documents ?? []).filter((d) => d.status === "ready"),
    [documents]
  );
  // A selected document that was deleted since is simply not shown or counted.
  const selectedIds = useMemo(() => {
    if (!selection) return null;
    const live = selection.filter((id) => ready.some((d) => d.id === id));
    return live.length > 0 ? live : null;
  }, [selection, ready]);

  const save = async (next: string[] | null) => {
    const before = selection;
    setSelection(remoteId, localId, next);
    if (!remoteId) return; // a draft: sent with the first message
    try {
      const res = await fetch(`/api/sessions/${remoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_ids: next }),
      });
      if (!res.ok) throw new Error();
      rememberSession((await res.json()) as SessionOut);
    } catch {
      setSelection(remoteId, localId, before);
      toast.error("Couldn't save the document selection.");
    }
  };

  const toggle = (id: string) => {
    const current = selectedIds ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    void save(next.length === 0 || next.length === ready.length ? null : next);
  };

  const label =
    !selectedIds || ready.length === 0
      ? "All documents"
      : `${selectedIds.length} of ${ready.length} documents`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" aria-label={`Documents searched: ${label}`}>
          <FileText aria-hidden />
          <span className="text-body-sm">{label}</span>
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-0">
        <div className="border-b border-rule px-3 py-2">
          <p className="ds-label">Search in</p>
        </div>
        {ready.length === 0 ? (
          <p className="px-3 py-4 text-body-sm text-muted-foreground">
            No ready documents yet. Upload one on the Documents page.
          </p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            <li className="border-b border-rule">
              <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 text-body-sm hover:bg-accent">
                <input
                  type="radio"
                  name="doc-scope"
                  checked={!selectedIds}
                  onChange={() => void save(null)}
                  className="size-4 accent-[var(--brand)]"
                />
                <span className="font-medium text-foreground">All documents</span>
                <span className="figure ml-auto text-muted-foreground">{ready.length}</span>
              </label>
            </li>
            {ready.map((d) => (
              <li key={d.id} className="border-b border-rule last:border-b-0">
                <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 text-body-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={selectedIds?.includes(d.id) ?? false}
                    onChange={() => toggle(d.id)}
                    className="size-4 accent-[var(--brand)]"
                  />
                  <span className="truncate text-foreground">{d.file_name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useState } from "react";
import { FileText, Plus, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ResumeUpload } from "@/components/dashboard/match/resume-upload";
import type { ResumeRecord } from "@/types/n8n";

interface MultiResumePickerProps {
  onNext: (fileIds: string[], resumes: ResumeRecord[]) => void;
}

export function MultiResumePicker({ onNext }: MultiResumePickerProps) {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(true);

  function toggle(fileId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === resumes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(resumes.map((r) => r.file_id)));
    }
  }

  function handleUploaded(resume: ResumeRecord) {
    setResumes((prev) => [resume, ...prev]);
    setSelectedIds((prev) => new Set(prev).add(resume.file_id));
    setShowUpload(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Upload resumes to screen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload one or more resumes to match against the job description.
        </p>
      </div>

      {/* Actions */}
      {resumes.length > 1 && (
        <Button variant="ghost" size="sm" onClick={selectAll} className="gap-2 -ml-2">
          {selectedIds.size === resumes.length ? (
            <><CheckSquare className="h-4 w-4" /> Deselect all</>
          ) : (
            <><Square className="h-4 w-4" /> Select all ({resumes.length})</>
          )}
        </Button>
      )}

      {/* Resume grid */}
      {resumes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumes.map((r) => {
            const selected = selectedIds.has(r.file_id);
            return (
              <button
                key={r.file_id}
                onClick={() => toggle(r.file_id)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                  selected
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                )}
              >
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  selected
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border"
                )}>
                  {selected && <CheckSquare className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.file_name}</p>
                  {r.file_size > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {(r.file_size / 1024).toFixed(0)} KB
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Upload */}
      {showUpload ? (
        <div className="rounded-lg border border-border p-4">
          <ResumeUpload
            onUploaded={handleUploaded}
            onCancel={resumes.length > 0 ? () => setShowUpload(false) : undefined}
            isCandidate={false}
            buttonLabel="Process resume"
          />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4" /> Upload another resume
        </Button>
      )}

      {/* Next */}
      <div className="pt-2">
        <Button
          disabled={selectedIds.size === 0}
          onClick={() => {
            const ids = Array.from(selectedIds);
            const selected = resumes.filter((r) => ids.includes(r.file_id));
            onNext(ids, selected);
          }}
          className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          Continue ({selectedIds.size} selected)
        </Button>
      </div>
    </div>
  );
}

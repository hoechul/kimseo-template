"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PROJECT_STATUS_OPTIONS,
  projectStatusButtonClass,
  type ProjectStatus,
} from "@/lib/project-status";
import { cn } from "@/lib/utils";

export function ProjectBulkActionBar({
  selectedCount,
  hiddenSelectedCount,
  pending,
  onBulkStatus,
  onClear,
}: {
  selectedCount: number;
  hiddenSelectedCount: number;
  pending: boolean;
  onBulkStatus: (status: ProjectStatus) => void | Promise<void>;
  onClear: () => void;
}) {
  if (selectedCount <= 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-5">
      <div className="pointer-events-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/95 p-2.5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:gap-3 sm:p-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">선택 {selectedCount}건</span>
          {hiddenSelectedCount > 0 && (
            <span className="text-xs text-muted-foreground">현재 보기에 {hiddenSelectedCount}건 숨겨짐</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {PROJECT_STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant="outline"
              className={cn("gap-1.5", projectStatusButtonClass(status))}
              disabled={pending}
              onClick={() => void onBulkStatus(status)}
            >
              {status}
            </Button>
          ))}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1 text-muted-foreground"
            onClick={onClear}
          >
            <X className="size-4" />
            선택 해제
          </Button>
        </div>
      </div>
    </div>
  );
}

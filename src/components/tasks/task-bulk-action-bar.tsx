"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TASK_STATUS_OPTIONS, type TaskDisplayStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";

function statusButtonClass(status: TaskDisplayStatus) {
  if (status === "완료") return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  if (status === "진행중") return "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100";
  if (status === "취소") return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100";
  if (status === "백로그") return "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100";
  return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
}

export function TaskBulkActionBar({
  selectedCount,
  hiddenSelectedCount,
  pending,
  onBulkStatus,
  onBulkDueDate,
  onClear,
}: {
  selectedCount: number;
  hiddenSelectedCount: number;
  pending: boolean;
  onBulkStatus: (status: TaskDisplayStatus) => void | Promise<void>;
  onBulkDueDate: (dueDate: string | null) => void | Promise<void>;
  onClear: () => void;
}) {
  const [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState("");

  if (selectedCount <= 0) return null;

  const handleDateApply = async () => {
    setDateOpen(false);
    await onBulkDueDate(dateDraft || null);
    setDateDraft("");
  };

  const handleDateClear = async () => {
    setDateOpen(false);
    setDateDraft("");
    await onBulkDueDate(null);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:pb-5">
      <div className="pointer-events-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-background/95 p-2.5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur sm:gap-3 sm:p-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">선택 {selectedCount}건</span>
          {hiddenSelectedCount > 0 && (
            <span className="text-xs text-muted-foreground">이 탭에 {hiddenSelectedCount}건 숨겨짐</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {TASK_STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant="outline"
              className={cn("gap-1.5", statusButtonClass(status))}
              disabled={pending}
              onClick={() => void onBulkStatus(status)}
            >
              {status}
            </Button>
          ))}

          <Popover
            open={dateOpen}
            onOpenChange={(open) => {
              setDateOpen(open);
              if (open) setDateDraft("");
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="gap-1" disabled={pending}>
                <CalendarClock className="size-4" />
                마감일
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="bulk-due-date">마감일</Label>
                  <Input
                    id="bulk-due-date"
                    type="date"
                    value={dateDraft}
                    onChange={(e) => setDateDraft(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => void handleDateClear()}>
                    날짜 없음
                  </Button>
                  <Button type="button" size="sm" onClick={() => void handleDateApply()} disabled={!dateDraft}>
                    적용
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

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

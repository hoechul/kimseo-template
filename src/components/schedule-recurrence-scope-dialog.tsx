"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ScheduleRecurrenceActionScope } from "@/lib/types";

interface ScheduleRecurrenceScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "update" | "delete";
  loading?: boolean;
  onSelect: (scope: ScheduleRecurrenceActionScope) => void | Promise<void>;
}

const SCOPE_OPTIONS: Record<
  "update" | "delete",
  Array<{
    scope: ScheduleRecurrenceActionScope;
    label: string;
    description: string;
  }>
> = {
  update: [
    {
      scope: "single",
      label: "이번 일정만 수정",
      description: "선택한 일정 1건만 수정합니다.",
    },
    {
      scope: "following",
      label: "이번 일정부터 앞으로 모두 수정",
      description: "현재 일정 이후의 반복 일정에만 같은 변경을 적용합니다.",
    },
    {
      scope: "all",
      label: "이 반복 일정 전체 수정",
      description: "과거와 미래를 포함한 같은 반복 일정 전체를 수정합니다.",
    },
  ],
  delete: [
    {
      scope: "single",
      label: "이번 일정만 삭제",
      description: "선택한 일정 1건만 삭제합니다.",
    },
    {
      scope: "following",
      label: "이번 일정부터 앞으로 모두 삭제",
      description: "현재 일정 이후의 반복 일정만 삭제합니다.",
    },
    {
      scope: "all",
      label: "이 반복 일정 전체 삭제",
      description: "과거와 미래를 포함한 같은 반복 일정 전체를 삭제합니다.",
    },
  ],
};

export function ScheduleRecurrenceScopeDialog({
  open,
  onOpenChange,
  action,
  loading = false,
  onSelect,
}: ScheduleRecurrenceScopeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{action === "update" ? "반복 일정 수정" : "반복 일정 삭제"}</DialogTitle>
          <DialogDescription>
            이번 일정에만 적용할지, 앞으로의 반복 일정에도 적용할지 선택해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {SCOPE_OPTIONS[action].map((option) => (
            <Button
              key={option.scope}
              type="button"
              variant="outline"
              className="h-auto w-full justify-start px-4 py-3 text-left"
              disabled={loading}
              onClick={() => void onSelect(option.scope)}
            >
              <div className="space-y-1">
                <div className="font-medium text-foreground">{option.label}</div>
                <div className="text-sm text-muted-foreground">{option.description}</div>
              </div>
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

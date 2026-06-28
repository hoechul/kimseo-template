"use client";

import { Bell, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { PageHeader, PageToolbar } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { format, addDays, addMonths, addWeeks, ko, subDays, subMonths, subWeeks, type ViewMode } from "./calendar-utils";

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onAddSchedule: () => void;
  onOpenNotificationSettings: () => void;
}

export function CalendarHeader({
  currentDate,
  viewMode,
  onDateChange,
  onViewModeChange,
  onAddSchedule,
  onOpenNotificationSettings,
}: CalendarHeaderProps) {
  const goBack = () => {
    if (viewMode === "month") onDateChange(subMonths(currentDate, 1));
    else if (viewMode === "week") onDateChange(subWeeks(currentDate, 1));
    else onDateChange(subDays(currentDate, 1));
  };

  const goForward = () => {
    if (viewMode === "month") onDateChange(addMonths(currentDate, 1));
    else if (viewMode === "week") onDateChange(addWeeks(currentDate, 1));
    else onDateChange(addDays(currentDate, 1));
  };

  const title =
    viewMode === "month"
      ? format(currentDate, "yyyy년 M월", { locale: ko })
      : viewMode === "week"
        ? format(currentDate, "yyyy년 M월", { locale: ko })
        : format(currentDate, "yyyy년 M월 d일 (EEE)", { locale: ko });

  return (
    <div className="space-y-4">
      <PageHeader
        title="일정관리"
        funKey="schedules"
        description="팀 일정을 한 화면에서 확인하고 바로 수정할 수 있습니다."
        actions={
          <>
            <Button variant="outline" onClick={onOpenNotificationSettings}>
              <Bell className="h-4 w-4" />
              알림설정
            </Button>
            <Button onClick={onAddSchedule}>
              <Plus className="h-4 w-4" />
              일정 등록
            </Button>
          </>
        }
      />

      <PageToolbar>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-1">
              <Button variant="ghost" size="icon-sm" onClick={goBack} aria-label="이전">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDateChange(new Date())}>
                오늘
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={goForward} aria-label="다음">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary">
              <CalendarDays className="h-4 w-4" />
              {title}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-2xl border border-border/70 bg-background/70 p-1">
              {(["month", "week", "day"] as ViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "default" : "ghost"}
                  size="sm"
                  className="rounded-xl"
                  onClick={() => onViewModeChange(mode)}
                >
                  {mode === "month" ? "월" : mode === "week" ? "주" : "일"}
                </Button>
              ))}
            </div>

            <div className="hidden rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground md:flex md:items-center md:gap-2">
              <span>`M` 월</span>
              <span>`W` 주</span>
              <span>`D` 일</span>
              <span>`← →` 이동</span>
            </div>
          </div>
        </div>
      </PageToolbar>
    </div>
  );
}

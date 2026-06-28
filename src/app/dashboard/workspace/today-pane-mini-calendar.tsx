"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  format,
  getMonthGrid,
  isSameMonth,
} from "@/components/calendar/calendar-utils";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export const TASK_DRAG_MIME = "application/x-yun-task-id";

interface MiniCalendarProps {
  currentMonth: Date;
  selectedDate: string;
  todayStr: string;
  viewMode: "day" | "month" | "unassigned";
  taskDateSet: Set<string>;
  scheduleDateSet: Set<string>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (dateStr: string) => void;
  onToday: () => void;
  onAllMonth: () => void;
  onUnassigned: () => void;
  onDropTask?: (taskId: string, dateStr: string) => void;
}

export function TodayPaneMiniCalendar({
  currentMonth,
  selectedDate,
  todayStr,
  viewMode,
  taskDateSet,
  scheduleDateSet,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  onToday,
  onAllMonth,
  onUnassigned,
  onDropTask,
}: MiniCalendarProps) {
  const grid = useMemo(() => getMonthGrid(currentMonth), [currentMonth]);
  const isMonthMode = viewMode === "month";
  const isUnassignedMode = viewMode === "unassigned";
  const isOnToday = viewMode === "day" && selectedDate === todayStr;
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  return (
    <div className="space-y-1.5 px-1">
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onPrevMonth}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent/60"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="text-xs font-semibold text-foreground">
          {format(currentMonth, "yyyy년 M월")}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onNextMonth}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent/60"
            aria-label="다음 달"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className={cn(
              "ml-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
              isOnToday
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent/60"
            )}
            aria-label="오늘로 이동"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={onAllMonth}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              isMonthMode
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent/60"
            )}
            aria-label="이번 달 전체 보기"
          >
            전체
          </button>
          <button
            type="button"
            onClick={onUnassigned}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              isUnassignedMode
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent/60"
            )}
            aria-label="마감일 미정 할일 보기"
          >
            미정
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px text-center">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "py-0.5 text-[10px] font-medium text-muted-foreground",
              i === 5 && "text-blue-500",
              i === 6 && "text-red-500"
            )}
          >
            {label}
          </div>
        ))}
        {grid.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, currentMonth);
          const isToday = key === todayStr;
          const isSelected = viewMode === "day" && key === selectedDate;
          const dow = day.getDay();
          const hasTask = taskDateSet.has(key);
          const hasSchedule = scheduleDateSet.has(key);

          const isDropTarget = dragOverDate === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              onDragOver={(e) => {
                if (!onDropTask) return;
                if (!e.dataTransfer.types.includes(TASK_DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverDate !== key) setDragOverDate(key);
              }}
              onDragLeave={() => {
                setDragOverDate((prev) => (prev === key ? null : prev));
              }}
              onDrop={(e) => {
                if (!onDropTask) return;
                const taskId = e.dataTransfer.getData(TASK_DRAG_MIME);
                setDragOverDate(null);
                if (!taskId) return;
                e.preventDefault();
                onDropTask(taskId, key);
              }}
              className={cn(
                "flex h-7 flex-col items-center justify-center rounded text-[11px] transition-colors",
                isSelected && "bg-primary/15 ring-1 ring-primary/60",
                !isSelected && isToday && "bg-primary/5",
                !isSelected && "hover:bg-accent/60",
                !inMonth && "text-muted-foreground/50",
                isDropTarget && "bg-primary/25 ring-2 ring-primary"
              )}
            >
              <span
                className={cn(
                  "leading-none",
                  isToday && inMonth && "font-bold text-primary",
                  !isToday && inMonth && dow === 0 && "text-red-500",
                  !isToday && inMonth && dow === 6 && "text-blue-500"
                )}
              >
                {format(day, "d")}
              </span>
              <span className="mt-0.5 flex h-1 items-center gap-0.5">
                {hasTask ? (
                  <span className="h-1 w-1 rounded-full bg-amber-500" />
                ) : null}
                {hasSchedule ? (
                  <span className="h-1 w-1 rounded-full bg-sky-500" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-amber-500" />
          할일
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-sky-500" />
          일정
        </span>
      </div>
    </div>
  );
}


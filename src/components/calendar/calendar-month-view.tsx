"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/lib/types";
import { CalendarEvent } from "./calendar-event";
import {
  getMonthGrid,
  getNormalizedScheduleRange,
  isSameMonth,
  isToday,
  format,
} from "./calendar-utils";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

interface CalendarMonthViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onDateClick: (date: Date) => void;
  onEventClick: (schedule: Schedule) => void;
}

export function CalendarMonthView({
  currentDate,
  schedules,
  onDateClick,
  onEventClick,
}: CalendarMonthViewProps) {
  const grid = useMemo(() => getMonthGrid(currentDate), [currentDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const schedule of schedules) {
      const { start, end } = getNormalizedScheduleRange(schedule);
      const startKey = format(start, "yyyy-MM-dd");
      const endKey = format(end, "yyyy-MM-dd");
      // Spread multi-day events across each day
      for (const day of grid) {
        const dayKey = format(day, "yyyy-MM-dd");
        if (dayKey >= startKey && dayKey <= endKey) {
          const arr = map.get(dayKey) ?? [];
          arr.push(schedule);
          map.set(dayKey, arr);
        }
      }
    }
    return map;
  }, [schedules, grid]);

  return (
    <div className="flex flex-col rounded-lg border">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "py-2 text-center text-xs font-medium text-muted-foreground",
              i === 5 && "text-blue-500",
              i === 6 && "text-red-500"
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {grid.map((day, idx) => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDay.get(key) ?? [];
          const dayOfWeek = day.getDay();
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <button
              key={key}
              className={cn(
                "relative flex min-h-[60px] flex-col border-b border-r p-1 text-left transition-colors hover:bg-muted/50 sm:min-h-[84px] sm:p-1.5",
                today && inMonth && "bg-primary/5",
                !inMonth && "bg-muted/30",
                idx % 7 === 6 && "border-r-0"
              )}
              onClick={() => onDateClick(day)}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs sm:h-6 sm:w-6 sm:text-sm",
                  today && "bg-primary text-primary-foreground font-bold",
                  !inMonth && "text-muted-foreground",
                  dayOfWeek === 0 && inMonth && !today && "text-red-500",
                  dayOfWeek === 6 && inMonth && !today && "text-blue-500"
                )}
              >
                {format(day, "d")}
              </span>

              {/* Events */}
              <div className="mt-0.5 flex flex-col gap-0.5">
                {events.map((ev) => (
                  <div key={ev.id} className="sm:hidden">
                    <CalendarEvent schedule={ev} compact onClick={() => onEventClick(ev)} />
                  </div>
                ))}
                {events.map((ev) => (
                  <div key={ev.id} className="hidden sm:block">
                    <CalendarEvent schedule={ev} compact onClick={() => onEventClick(ev)} />
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";
import type { Schedule } from "@/lib/types";
import { format, parseISO, getCategoryColor, toPastel } from "./calendar-utils";

interface CalendarEventProps {
  schedule: Schedule;
  compact?: boolean;
  short?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  startAtOverride?: string;
}

export function CalendarEvent({ schedule, compact, short, onClick, startAtOverride }: CalendarEventProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };
  const categoryColor = getCategoryColor(schedule.category);
  const displayStartAt = startAtOverride ?? schedule.start_at;

  const startTime = schedule.all_day
    ? null
    : format(parseISO(displayStartAt), "HH:mm");

  if (compact) {
    return (
      <div
        role="button"
        onClick={handleClick}
        className="w-full rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-opacity hover:opacity-80 sm:text-xs"
        style={{ backgroundColor: toPastel(categoryColor), color: categoryColor }}
      >
        <p className="break-words whitespace-normal">
          {startTime && <span className="text-[9px] opacity-80 sm:text-[10px]">{startTime} </span>}
          <span>{schedule.title}</span>
        </p>
      </div>
    );
  }

  return (
    <div
      role="button"
      onClick={handleClick}
      className={cn(
        "h-full w-full overflow-hidden rounded-md border text-left text-xs shadow-sm transition-opacity hover:opacity-90",
        short ? "flex items-center gap-1 px-1.5 py-0" : "px-2 py-1"
      )}
      style={{ backgroundColor: toPastel(categoryColor), borderColor: toPastel(categoryColor, 0.3), color: categoryColor }}
    >
      <p className={cn(
        "font-medium",
        short ? "truncate text-[10px] leading-none" : "break-words whitespace-normal leading-snug"
      )}>
        {startTime && <span className={cn("opacity-70", short ? "text-[9px]" : "text-[10px]")}>{startTime} </span>}
        <span>{schedule.title}</span>
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { Schedule } from "@/lib/types";
import { CalendarEvent } from "./calendar-event";
import {
  HOURS,
  format,
  getNormalizedScheduleRange,
  getPositionedCalendarEvents,
  isSameDay,
  isToday,
  ko,
  parseISO,
} from "./calendar-utils";

const HOUR_HEIGHT = 60;
const MIN_EVENT_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;

interface CalendarDayViewProps {
  currentDate: Date;
  schedules: Schedule[];
  onTimeClick: (date: Date, hour: number) => void;
  onEventClick: (schedule: Schedule) => void;
  onEventTimeChange: (schedule: Schedule, startAt: string, endAt: string) => Promise<void> | void;
}

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
  schedule: Schedule;
  mode: DragMode;
  initialClientY: number;
  originalStartMinutes: number;
  originalEndMinutes: number;
  startMinutes: number;
  endMinutes: number;
  moved: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapMinutes(value: number) {
  return Math.round(value / MIN_EVENT_MINUTES) * MIN_EVENT_MINUTES;
}

function getMinutesFromDate(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function buildDateFromMinutes(day: Date, minutes: number) {
  const nextDate = new Date(day);
  nextDate.setHours(0, 0, 0, 0);
  nextDate.setMinutes(minutes);
  return nextDate;
}

export function CalendarDayView({
  currentDate,
  schedules,
  onTimeClick,
  onEventClick,
  onEventTimeChange,
}: CalendarDayViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const allDayEvents = useMemo(
    () =>
      schedules.filter((schedule) => {
        if (!schedule.all_day) return false;
        const { start } = getNormalizedScheduleRange(schedule);
        return isSameDay(start, currentDate);
      }),
    [schedules, currentDate]
  );

  const timedEvents = useMemo(
    () => schedules.filter((schedule) => !schedule.all_day && isSameDay(parseISO(schedule.start_at), currentDate)),
    [schedules, currentDate]
  );

  const positionedEvents = useMemo(
    () => getPositionedCalendarEvents(timedEvents, HOUR_HEIGHT),
    [timedEvents]
  );

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (element) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const scrollTarget = Math.max(0, (currentMinutes / 60) * HOUR_HEIGHT - 100);
      element.scrollTop = scrollTarget;
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const deltaMinutes = snapMinutes(((event.clientY - dragState.initialClientY) / HOUR_HEIGHT) * 60);
      const duration = dragState.originalEndMinutes - dragState.originalStartMinutes;

      if (dragState.mode === "move") {
        const startMinutes = clamp(
          dragState.originalStartMinutes + deltaMinutes,
          0,
          MINUTES_PER_DAY - duration
        );

        setDragState((prev) =>
          prev
            ? {
                ...prev,
                startMinutes,
                endMinutes: startMinutes + duration,
                moved: prev.moved || startMinutes !== prev.originalStartMinutes,
              }
            : prev
        );
        return;
      }

      if (dragState.mode === "resize-start") {
        const startMinutes = clamp(
          dragState.originalStartMinutes + deltaMinutes,
          0,
          dragState.originalEndMinutes - MIN_EVENT_MINUTES
        );

        setDragState((prev) =>
          prev
            ? {
                ...prev,
                startMinutes,
                moved: prev.moved || startMinutes !== prev.originalStartMinutes,
              }
            : prev
        );
        return;
      }

      const endMinutes = clamp(
        dragState.originalEndMinutes + deltaMinutes,
        dragState.originalStartMinutes + MIN_EVENT_MINUTES,
        MINUTES_PER_DAY
      );

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              endMinutes,
              moved: prev.moved || endMinutes !== prev.originalEndMinutes,
            }
          : prev
      );
    };

    const handlePointerUp = () => {
      const activeDrag = dragState;
      setDragState(null);

      if (!activeDrag) return;

      if (!activeDrag.moved) {
        if (activeDrag.mode === "move") onEventClick(activeDrag.schedule);
        return;
      }

      suppressClickRef.current = true;

      const startAt = buildDateFromMinutes(currentDate, activeDrag.startMinutes).toISOString();
      const endAt = buildDateFromMinutes(currentDate, activeDrag.endMinutes).toISOString();
      void onEventTimeChange(activeDrag.schedule, startAt, endAt);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [currentDate, dragState, onEventClick, onEventTimeChange]);

  const startDrag = (schedule: Schedule, mode: DragMode, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startDate = parseISO(schedule.start_at);
    const endDate = parseISO(schedule.end_at);

    setDragState({
      schedule,
      mode,
      initialClientY: event.clientY,
      originalStartMinutes: getMinutesFromDate(startDate),
      originalEndMinutes: getMinutesFromDate(endDate),
      startMinutes: getMinutesFromDate(startDate),
      endMinutes: getMinutesFromDate(endDate),
      moved: false,
    });
  };

  const today = isToday(currentDate);

  return (
    <div className="flex flex-col rounded-lg border">
      <div className="border-b px-4 py-3">
        <div className="text-xs text-muted-foreground">
          {format(currentDate, "EEE", { locale: ko })}
        </div>
        <div className={cn("text-lg font-semibold", today && "text-primary")}>
          {format(currentDate, "M월 d일", { locale: ko })}
        </div>
      </div>

      {allDayEvents.length > 0 && (
        <div className="space-y-0.5 border-b px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground">종일</span>
          {allDayEvents.map((schedule) => (
            <CalendarEvent key={schedule.id} schedule={schedule} onClick={() => onEventClick(schedule)} />
          ))}
        </div>
      )}

      <div ref={scrollContainerRef} className="relative overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div className="relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute flex w-full cursor-pointer border-b hover:bg-muted/30"
              style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              onClick={() => onTimeClick(currentDate, hour)}
            >
              <div className="w-14 flex-shrink-0 border-r px-2 text-right text-xs text-muted-foreground">
                {String(hour).padStart(2, "0")}:00
              </div>
              <div className="flex-1" />
            </div>
          ))}

          {today && (
            <>
              <div
                className="pointer-events-none absolute inset-x-0 z-[5] bg-red-500/8"
                style={{
                  top: `${Math.floor(nowMinutes / 60) * HOUR_HEIGHT}px`,
                  height: `${HOUR_HEIGHT}px`,
                }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                style={{ top: `${(nowMinutes / 60) * HOUR_HEIGHT}px` }}
              >
                <div className="ml-14 h-2 w-2 -translate-x-1 rounded-full bg-red-500" />
                <div className="h-[2px] flex-1 bg-red-500" />
              </div>
            </>
          )}

          <div className="absolute inset-y-0 left-16 right-2">
            {positionedEvents.map((event) => {
              const isDragging = dragState?.schedule.id === event.schedule.id;
              const displayTop = isDragging ? (dragState.startMinutes / 60) * HOUR_HEIGHT : event.top;
              const displayHeight = isDragging
                ? ((dragState.endMinutes - dragState.startMinutes) / 60) * HOUR_HEIGHT
                : event.height;
              const previewStartAt = isDragging
                ? buildDateFromMinutes(currentDate, dragState.startMinutes).toISOString()
                : event.schedule.start_at;
              const width = `calc(${100 / event.columns}% - 6px)`;
              const left = `calc(${(100 / event.columns) * event.column}% + 2px)`;

              return (
                <div
                  key={event.schedule.id}
                  className="absolute z-10"
                  style={{
                    top: `${displayTop}px`,
                    height: `${displayHeight}px`,
                    width,
                    left,
                  }}
                >
                  <div
                    className={cn(
                      "group relative h-full w-full touch-none cursor-grab active:cursor-grabbing",
                      isDragging && "opacity-90"
                    )}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      onEventClick(event.schedule);
                    }}
                    onPointerDown={(pointerEvent) => startDrag(event.schedule, "move", pointerEvent)}
                  >
                    <div className="pointer-events-none h-full w-full">
                      <CalendarEvent schedule={event.schedule} startAtOverride={previewStartAt} short={displayHeight <= HOUR_HEIGHT / 2} />
                    </div>
                    <div
                      className="absolute inset-x-0 top-0 z-30 min-h-[16px] sm:min-h-[10px] h-[16px] sm:h-[10px] cursor-ns-resize"
                      onPointerDown={(pointerEvent) => startDrag(event.schedule, "resize-start", pointerEvent)}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 z-30 min-h-[16px] sm:min-h-[10px] h-[16px] sm:h-[10px] cursor-ns-resize"
                      onPointerDown={(pointerEvent) => startDrag(event.schedule, "resize-end", pointerEvent)}
                    />
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[16px] sm:h-[10px] rounded-t-md border-t-2 border-current opacity-0 transition-opacity group-hover:opacity-60" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[16px] sm:h-[10px] rounded-b-md border-b-2 border-current opacity-0 transition-opacity group-hover:opacity-60" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

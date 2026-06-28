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
  getWeekDays,
  isSameDay,
  isToday,
  ko,
  parseISO,
  startOfDay,
} from "./calendar-utils";

const HOUR_HEIGHT = 60;
const TIME_COLUMN_WIDTH = 48;
const MIN_EVENT_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;
const RESIZE_HANDLE_HEIGHT = 10;

interface CalendarWeekViewProps {
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
  initialClientX: number;
  initialClientY: number;
  originalDayIndex: number;
  originalStartMinutes: number;
  originalEndMinutes: number;
  dayIndex: number;
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

function buildDateFromDay(day: Date, minutes: number) {
  const nextDate = new Date(day);
  nextDate.setHours(0, 0, 0, 0);
  nextDate.setMinutes(minutes);
  return nextDate;
}

export function CalendarWeekView({
  currentDate,
  schedules,
  onTimeClick,
  onEventClick,
  onEventTimeChange,
}: CalendarWeekViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const days = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const todayDayIndex = useMemo(() => days.findIndex((day) => isToday(day)), [days]);

  const allDayEvents = useMemo(() => schedules.filter((schedule) => schedule.all_day), [schedules]);
  const timedEvents = useMemo(() => schedules.filter((schedule) => !schedule.all_day), [schedules]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const updateScrollbarWidth = () => {
      setScrollbarWidth(element.offsetWidth - element.clientWidth);
    };

    updateScrollbarWidth();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const scrollTarget = Math.max(0, (currentMinutes / 60) * HOUR_HEIGHT - 100);
    element.scrollTop = scrollTarget;

    const resizeObserver = new ResizeObserver(updateScrollbarWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
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
      const gridElement = gridRef.current;
      if (!gridElement) return;

      const rect = gridElement.getBoundingClientRect();
      const dayWidth = (rect.width - TIME_COLUMN_WIDTH) / 7;
      const duration = dragState.originalEndMinutes - dragState.originalStartMinutes;

      if (dragState.mode === "move") {
        const deltaDays = Math.round((event.clientX - dragState.initialClientX) / dayWidth);
        const deltaMinutes = snapMinutes(((event.clientY - dragState.initialClientY) / HOUR_HEIGHT) * 60);
        const dayIndex = clamp(dragState.originalDayIndex + deltaDays, 0, 6);
        const startMinutes = clamp(
          dragState.originalStartMinutes + deltaMinutes,
          0,
          MINUTES_PER_DAY - duration
        );

        setDragState((prev) =>
          prev
            ? {
                ...prev,
                dayIndex,
                startMinutes,
                endMinutes: startMinutes + duration,
                moved: prev.moved || Math.abs(deltaDays) > 0 || Math.abs(deltaMinutes) > 0,
              }
            : prev
        );
        return;
      }

      const deltaMinutes = snapMinutes(((event.clientY - dragState.initialClientY) / HOUR_HEIGHT) * 60);

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

      const nextDay = days[activeDrag.dayIndex];
      const startAt = buildDateFromDay(nextDay, activeDrag.startMinutes).toISOString();
      const endAt = buildDateFromDay(nextDay, activeDrag.endMinutes).toISOString();

      void onEventTimeChange(activeDrag.schedule, startAt, endAt);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [days, dragState, onEventClick, onEventTimeChange]);

  const startDrag = (schedule: Schedule, mode: DragMode, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const startDate = parseISO(schedule.start_at);
    const endDate = parseISO(schedule.end_at);
    const originalDayIndex = days.findIndex((day) => isSameDay(startDate, day));
    if (originalDayIndex === -1) return;

    setDragState({
      schedule,
      mode,
      initialClientX: event.clientX,
      initialClientY: event.clientY,
      originalDayIndex,
      originalStartMinutes: getMinutesFromDate(startDate),
      originalEndMinutes: getMinutesFromDate(endDate),
      dayIndex: originalDayIndex,
      startMinutes: getMinutesFromDate(startDate),
      endMinutes: getMinutesFromDate(endDate),
      moved: false,
    });
  };

  return (
    <div className="flex flex-col rounded-lg border">
      <div
        className="grid border-b"
        style={{
          gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))",
          paddingRight: `${scrollbarWidth}px`,
        }}
      >
        <div className="border-r" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn("border-r px-1 py-2 text-center last:border-r-0", isToday(day) && "bg-primary/5")}
          >
            <div className="text-xs text-muted-foreground">{format(day, "EEE", { locale: ko })}</div>
            <div
              className={cn(
                "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                isToday(day) && "bg-primary text-primary-foreground"
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {allDayEvents.length > 0 && (
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))",
            paddingRight: `${scrollbarWidth}px`,
          }}
        >
          <div className="border-r px-1 py-1 text-[10px] text-muted-foreground">종일</div>
          {days.map((day) => {
            const dayEvents = allDayEvents.filter((schedule) => {
              const { start, end } = getNormalizedScheduleRange(schedule);
              return day >= startOfDay(start) && day <= startOfDay(end);
            });

            return (
              <div key={day.toISOString()} className="space-y-0.5 border-r p-0.5 last:border-r-0">
                {dayEvents.map((schedule) => (
                  <CalendarEvent
                    key={schedule.id}
                    schedule={schedule}
                    compact
                    onClick={() => onEventClick(schedule)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div ref={scrollContainerRef} className="relative overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <div
          ref={gridRef}
          className="grid"
          style={{
            gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))",
            height: `${HOURS.length * HOUR_HEIGHT}px`,
          }}
        >
          <div className="relative border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full border-b px-1 text-right text-[10px] text-muted-foreground"
                style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const dayEvents = timedEvents.filter((schedule) => isSameDay(parseISO(schedule.start_at), day));
            const positionedEvents = getPositionedCalendarEvents(dayEvents, HOUR_HEIGHT);

            return (
              <div
                key={day.toISOString()}
                className={cn("relative border-r last:border-r-0", isToday(day) && "bg-primary/5")}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full cursor-pointer border-b hover:bg-muted/30"
                    style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    onClick={() => onTimeClick(day, hour)}
                  />
                ))}

                {dayIndex === todayDayIndex && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 bg-red-500/8"
                      style={{
                        top: `${Math.floor(nowMinutes / 60) * HOUR_HEIGHT}px`,
                        height: `${HOUR_HEIGHT}px`,
                      }}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
                      style={{ top: `${(nowMinutes / 60) * HOUR_HEIGHT}px` }}
                    >
                      <div className="h-2 w-2 -translate-x-1 rounded-full bg-red-500" />
                      <div className="h-[2px] flex-1 bg-red-500" />
                    </div>
                  </>
                )}

                {positionedEvents.map((event) => {
                  if (dragState?.schedule.id === event.schedule.id && dragState.dayIndex !== dayIndex) return null;

                  const isDragging = dragState?.schedule.id === event.schedule.id;
                  const displayTop = isDragging ? (dragState.startMinutes / 60) * HOUR_HEIGHT : event.top;
                  const displayHeight = isDragging
                    ? ((dragState.endMinutes - dragState.startMinutes) / 60) * HOUR_HEIGHT
                    : event.height;
                  const previewStartAt = isDragging
                    ? buildDateFromDay(days[dragState.dayIndex], dragState.startMinutes).toISOString()
                    : event.schedule.start_at;
                  const width = `calc(${100 / event.columns}% - 4px)`;
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
            );
          })}
        </div>
      </div>
    </div>
  );
}

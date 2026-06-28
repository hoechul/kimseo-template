"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { TaskStaticCard } from "@/components/tasks/kanban-card";
import { TimelineBar } from "@/components/tasks/timeline-bar";
import { Button } from "@/components/ui/button";
import {
  addDaysISO,
  getTaskDateRange,
  getWeekDaysISO,
  isMultiDayTask,
  isTaskInWeek,
  startOfWeekISO,
  todayISO,
} from "@/lib/tasks/date-filter";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const MAX_TIMELINE_LANES = 3;

function formatWeekdayLabel(index: number, dateISO: string, today: string) {
  const [, month, day] = dateISO.split("-");
  const isToday = dateISO === today;
  return {
    label: WEEKDAY_LABELS[index],
    date: `${Number(month)}/${Number(day)}`,
    isToday,
  };
}

function assignLanes(bars: Task[], weekDays: string[]) {
  const lanes: Array<{ end: string; task: Task }[]> = [];
  const placement = new Map<string, number>();

  const sorted = [...bars].sort((a, b) => {
    const ra = getTaskDateRange(a);
    const rb = getTaskDateRange(b);
    if (!ra || !rb) return 0;
    if (ra.start !== rb.start) return ra.start.localeCompare(rb.start);
    return ra.end.localeCompare(rb.end);
  });

  const weekStart = weekDays[0];
  const weekEnd = weekDays[weekDays.length - 1];

  for (const task of sorted) {
    const range = getTaskDateRange(task);
    if (!range) continue;
    const start = range.start < weekStart ? weekStart : range.start;
    const end = range.end > weekEnd ? weekEnd : range.end;

    let laneIndex = lanes.findIndex((lane) => {
      const last = lane[lane.length - 1];
      return !last || last.end < start;
    });
    if (laneIndex === -1) {
      if (lanes.length >= MAX_TIMELINE_LANES) continue;
      lanes.push([]);
      laneIndex = lanes.length - 1;
    }
    lanes[laneIndex].push({ end, task });
    placement.set(task.id, laneIndex);
  }

  const overflow = sorted.filter((t) => !placement.has(t.id));
  return { lanes: lanes.length, placement, overflow };
}

export function TasksWeekView({
  tasks,
  assigneeMap,
  onNavigate,
  onOpenProjectLink,
}: {
  tasks: Task[];
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
}) {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(today));
  const weekDays = useMemo(() => getWeekDaysISO(weekStart), [weekStart]);

  const { multiDayTasks, dailyByDate } = useMemo(() => {
    const multi: Task[] = [];
    const byDate: Record<string, Task[]> = {};
    for (const day of weekDays) byDate[day] = [];

    for (const task of tasks) {
      if (!isTaskInWeek(task, weekStart)) continue;
      if (isMultiDayTask(task)) {
        multi.push(task);
      } else {
        const range = getTaskDateRange(task);
        if (!range) continue;
        const day = range.end;
        if (byDate[day]) byDate[day].push(task);
      }
    }
    return { multiDayTasks: multi, dailyByDate: byDate };
  }, [tasks, weekDays, weekStart]);

  const { lanes: timelineLaneCount, placement, overflow } = useMemo(
    () => assignLanes(multiDayTasks, weekDays),
    [multiDayTasks, weekDays]
  );

  const handlePrev = () => setWeekStart((w) => addDaysISO(w, -7));
  const handleNext = () => setWeekStart((w) => addDaysISO(w, 7));
  const handleToday = () => setWeekStart(startOfWeekISO(today));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handlePrev}>
          <ChevronLeft className="size-4" />
          이전 주
        </Button>
        <Button variant="outline" size="sm" onClick={handleToday}>
          오늘
        </Button>
        <Button variant="outline" size="sm" onClick={handleNext}>
          다음 주
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {weekDays[0]} ~ {weekDays[6]}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px] rounded-[1.25rem] border border-border/70 bg-background/40 p-3">
          <div className="grid grid-cols-7 gap-1 border-b border-border/50 pb-2">
            {weekDays.map((day, index) => {
              const { label, date, isToday } = formatWeekdayLabel(index, day, today);
              return (
                <div
                  key={day}
                  className={cn(
                    "flex flex-col items-center rounded-lg py-1 text-xs",
                    isToday && "bg-primary/10 font-semibold text-primary"
                  )}
                >
                  <span>{label}</span>
                  <span className="text-muted-foreground">{date}</span>
                </div>
              );
            })}
          </div>

          {timelineLaneCount > 0 ? (
            <div
              className="mt-3 grid gap-1"
              style={{
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gridTemplateRows: `repeat(${timelineLaneCount}, minmax(28px, auto))`,
              }}
            >
              {multiDayTasks
                .filter((t) => placement.has(t.id))
                .map((task) => (
                  <TimelineBar
                    key={task.id}
                    task={task}
                    weekDays={weekDays}
                    laneRow={placement.get(task.id) ?? 0}
                    assigneeMap={assigneeMap}
                    onNavigate={onNavigate}
                  />
                ))}
            </div>
          ) : null}

          {overflow.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              + 추가 기간 TODO {overflow.length}건 (공간 초과)
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className={cn(
                  "flex min-h-[160px] flex-col gap-1.5 rounded-lg border border-dashed border-border/50 bg-background/50 p-1.5",
                  day === today && "border-primary/40 bg-primary/5"
                )}
              >
                {dailyByDate[day].map((task) => (
                  <TaskStaticCard
                    key={task.id}
                    task={task}
                    assigneeMap={assigneeMap}
                    onNavigate={onNavigate}
                    onOpenProjectLink={onOpenProjectLink}
                  />
                ))}
                {dailyByDate[day].length === 0 ? (
                  <span className="mx-auto my-auto text-[11px] text-muted-foreground">
                    —
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

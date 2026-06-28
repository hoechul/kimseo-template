"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ListTodo, Minus, PlayCircle, Plus } from "lucide-react";

import { StatCard, StatsGrid } from "@/components/page-shell";
import { statusBadgeClass } from "@/components/tasks/task-row-parts";
import { getTaskAssigneeLabel } from "@/lib/task-assignees";
import { normalizeTaskStatus } from "@/lib/task-status";
import { getTaskDateRange, todayISO } from "@/lib/tasks/date-filter";
import { computeProjectProgress } from "@/lib/tasks/progress";
import type { Project, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEFAULT_DAY_WIDTH_PX = 36;
const MIN_DAY_WIDTH_PX = 18;
const MAX_DAY_WIDTH_PX = 64;
const DAY_WIDTH_STEP_PX = 6;
const LEFT_COL_WIDTH_PX = 260;
const ROW_HEIGHT_PX = 44;

function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toUTCDate(iso: string): Date {
  const { y, m, d } = parseISODate(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTCDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function addDaysUTC(iso: string, days: number): string {
  const dt = toUTCDate(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUTCDate(dt);
}

function diffDaysISO(from: string, to: string): number {
  return Math.round((toUTCDate(to).getTime() - toUTCDate(from).getTime()) / 86400000);
}

type AxisColumn = {
  key: string;
  month: number;
  day: number;
  isFirstOfMonth: boolean;
  isTodayColumn: boolean;
  isWeekend: boolean;
};

function buildDayColumns(axisStart: string, axisEnd: string, today: string): AxisColumn[] {
  const columns: AxisColumn[] = [];
  let cur = axisStart;
  let prevMonth = -1;
  while (cur <= axisEnd) {
    const [, m, d] = cur.split("-");
    const month = Number(m);
    const day = Number(d);
    const weekday = toUTCDate(cur).getUTCDay();
    columns.push({
      key: cur,
      month,
      day,
      isFirstOfMonth: month !== prevMonth,
      isTodayColumn: cur === today,
      isWeekend: weekday === 0 || weekday === 6,
    });
    prevMonth = month;
    cur = addDaysUTC(cur, 1);
  }
  return columns;
}

function statusBarClass(task: Task) {
  const status = normalizeTaskStatus(task.status);
  if (status === "완료") return "bg-emerald-500/90 hover:bg-emerald-500";
  if (status === "진행중") return "bg-sky-500/90 hover:bg-sky-500";
  if (status === "취소") return "bg-rose-400/80 hover:bg-rose-400";
  if (status === "백로그") return "bg-violet-400/90 hover:bg-violet-400";
  return "bg-amber-400/90 hover:bg-amber-400";
}

export function TasksGanttView({
  tasks,
  project,
  employeeNameMap,
  onSelectTask,
}: {
  tasks: Task[];
  project: Project | null;
  employeeNameMap: Map<string, string>;
  onSelectTask: (taskId: string) => void;
}) {
  const today = todayISO();

  const progress = useMemo(() => computeProjectProgress(tasks), [tasks]);

  const { scheduled, unscheduled } = useMemo(() => {
    const s: { task: Task; start: string; end: string }[] = [];
    const u: Task[] = [];
    for (const task of tasks) {
      const range = getTaskDateRange(task);
      if (range) s.push({ task, start: range.start, end: range.end });
      else u.push(task);
    }
    s.sort((a, b) => {
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      return a.end.localeCompare(b.end);
    });
    return { scheduled: s, unscheduled: u };
  }, [tasks]);

  const axisRange = useMemo(() => {
    if (scheduled.length > 0) {
      let minStart = scheduled[0].start;
      let maxEnd = scheduled[0].end;
      for (const s of scheduled) {
        if (s.start < minStart) minStart = s.start;
        if (s.end > maxEnd) maxEnd = s.end;
      }
      minStart = addDaysUTC(minStart, -1);
      maxEnd = addDaysUTC(maxEnd, 1);
      return { start: minStart, end: maxEnd };
    }
    if (project?.start_date && project?.end_date) {
      return { start: project.start_date, end: project.end_date };
    }
    const start = project?.start_date ?? today;
    const end = project?.end_date ?? addDaysUTC(start, 13);
    return { start, end: end > start ? end : addDaysUTC(start, 13) };
  }, [scheduled, project, today]);

  const axisTotalDays = useMemo(
    () => Math.max(1, diffDaysISO(axisRange.start, axisRange.end) + 1),
    [axisRange]
  );

  const [dayWidth, setDayWidth] = useState<number>(DEFAULT_DAY_WIDTH_PX);
  const chartWidth = axisTotalDays * dayWidth;

  const columns = useMemo(
    () => buildDayColumns(axisRange.start, axisRange.end, today),
    [axisRange, today]
  );

  const todayOffset = useMemo(() => {
    if (today < axisRange.start || today > axisRange.end) return null;
    return diffDaysISO(axisRange.start, today) * dayWidth + dayWidth / 2;
  }, [today, axisRange, dayWidth]);

  const canZoomIn = dayWidth < MAX_DAY_WIDTH_PX;
  const canZoomOut = dayWidth > MIN_DAY_WIDTH_PX;

  if (tasks.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          연결된 할일이 없습니다. 이 화면에서 등록하면 현재 프로젝트에 바로 연결됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatsGrid>
        <StatCard
          label="전체 할일"
          value={`${progress.total + progress.cancelled}건`}
          description={progress.cancelled > 0 ? `취소 ${progress.cancelled}건 제외` : "취소 항목 없음"}
          icon={ListTodo}
        />
        <StatCard
          label="완료"
          value={`${progress.done}건`}
          description={`진행 완료된 할일 수`}
          icon={CheckCircle2}
          tone={progress.done > 0 ? "success" : "default"}
        />
        <StatCard
          label="진행중"
          value={`${progress.inProgress}건`}
          description={`할 일 ${progress.pending}건 · 백로그 포함`}
          icon={PlayCircle}
          tone={progress.inProgress > 0 ? "info" : "default"}
        />
        <StatCard
          label="전체 진척률"
          value={`${progress.percent}%`}
          description={`완료 ${progress.done} / 유효 ${progress.total}건 기준`}
          icon={CalendarDays}
          tone={progress.percent >= 100 ? "success" : progress.percent > 0 ? "brand" : "default"}
        />
      </StatsGrid>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 p-1">
          <button
            type="button"
            onClick={() => setDayWidth((w) => Math.max(MIN_DAY_WIDTH_PX, w - DAY_WIDTH_STEP_PX))}
            disabled={!canZoomOut}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="열 너비 줄이기"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="min-w-10 text-center text-[11px] font-medium text-muted-foreground">
            {dayWidth}px
          </span>
          <button
            type="button"
            onClick={() => setDayWidth((w) => Math.min(MAX_DAY_WIDTH_PX, w + DAY_WIDTH_STEP_PX))}
            disabled={!canZoomIn}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="열 너비 늘리기"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          {axisRange.start} ~ {axisRange.end} · {axisTotalDays}일
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-border/70 bg-background/40">
        <div className="relative overflow-x-auto">
          <div style={{ minWidth: LEFT_COL_WIDTH_PX + chartWidth }}>
            <div className="flex border-b border-border/60">
              <div
                className="sticky left-0 z-20 flex items-center border-r border-border/60 bg-card/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur"
                style={{ width: LEFT_COL_WIDTH_PX, minWidth: LEFT_COL_WIDTH_PX }}
              >
                할일
              </div>
              <div className="flex" style={{ width: chartWidth }}>
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={cn(
                      "flex flex-col items-center justify-center border-r border-border/40 py-1 leading-tight tabular-nums",
                      col.isWeekend && "bg-muted/30",
                      col.isTodayColumn && "bg-primary/10 font-semibold text-primary"
                    )}
                    style={{ width: dayWidth }}
                  >
                    <span
                      className={cn(
                        "text-[9px]",
                        col.isFirstOfMonth
                          ? "font-semibold text-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {col.month}월
                    </span>
                    <span className="text-[11px]">{col.day}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              {todayOffset != null ? (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-rose-500/60"
                  style={{ left: LEFT_COL_WIDTH_PX + todayOffset }}
                  aria-hidden
                />
              ) : null}

              {scheduled.map(({ task, start, end }) => {
                const clampedStart = start < axisRange.start ? axisRange.start : start;
                const clampedEnd = end > axisRange.end ? axisRange.end : end;
                const barLeft = diffDaysISO(axisRange.start, clampedStart) * dayWidth;
                const barSpanDays = diffDaysISO(clampedStart, clampedEnd) + 1;
                const barWidth = barSpanDays * dayWidth;
                const status = normalizeTaskStatus(task.status);

                return (
                  <div
                    key={task.id}
                    className="flex border-b border-border/30 last:border-b-0"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectTask(task.id)}
                      className="sticky left-0 z-10 flex w-full items-center gap-2 border-r border-border/60 bg-card/95 px-3 text-left text-sm backdrop-blur hover:bg-muted/50"
                      style={{ width: LEFT_COL_WIDTH_PX, minWidth: LEFT_COL_WIDTH_PX }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{task.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {getTaskAssigneeLabel(task, employeeNameMap)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          statusBadgeClass(task.status)
                        )}
                      >
                        {status}
                      </span>
                    </button>

                    <div className="relative" style={{ width: chartWidth }}>
                      <div
                        className="pointer-events-none absolute inset-0 flex"
                        aria-hidden
                      >
                        {columns.map((col) => (
                          <div
                            key={col.key}
                            className={cn(
                              "border-r border-border/20",
                              col.isWeekend && "bg-muted/20"
                            )}
                            style={{ width: dayWidth }}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectTask(task.id)}
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 rounded-md shadow-sm transition",
                          statusBarClass(task)
                        )}
                        style={{
                          left: barLeft,
                          width: barWidth,
                          height: 22,
                        }}
                        title={`${task.title} (${start}${start !== end ? ` ~ ${end}` : ""}) · ${status}`}
                        aria-label={`${task.title} ${status}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {unscheduled.length > 0 ? (
        <div className="rounded-[1.25rem] border border-dashed border-border/70 bg-background/40 p-3">
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            기간 미지정 할일 {unscheduled.length}건
          </div>
          <ul className="divide-y divide-border/40">
            {unscheduled.map((task) => {
              const status = normalizeTaskStatus(task.status);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTask(task.id)}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {getTaskAssigneeLabel(task, employeeNameMap)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        statusBadgeClass(task.status)
                      )}
                    >
                      {status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

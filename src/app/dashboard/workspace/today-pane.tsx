"use client";

import { Calendar, ListTodo, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ScheduleDialog } from "@/components/schedule-dialog";
import { TaskCreateDialog } from "@/components/task-create-dialog";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useMasking } from "@/components/masking-provider";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  getMonthGrid,
  getNormalizedScheduleRange,
  startOfDay,
  startOfMonth,
  subMonths,
} from "@/components/calendar/calendar-utils";
import { sendLog } from "@/lib/log-client";
import {
  formatKstDateLabel,
  formatKstTime,
  toKstDateString,
} from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import { bulkUpdateTasks } from "@/lib/task-mutations";
import { TASK_ASSIGNEE_SELECT } from "@/lib/task-assignees";
import { normalizeTaskStatus, normalizeTaskStatuses } from "@/lib/task-status";
import { getTaskDateRange } from "@/lib/tasks/date-filter";
import type {
  Employee,
  Project,
  RecurrenceType,
  Schedule,
  ScheduleCategoryItem,
  ScheduleInsert,
  ScheduleRecurrenceActionScope,
  Task,
} from "@/lib/types";

import {
  TASK_DRAG_MIME,
  TodayPaneMiniCalendar,
} from "./today-pane-mini-calendar";

interface TodayPaneProps {
  projects: Project[];
  employees: Employee[];
  currentEmployeeId: string | null;
  onJumpToProject: (projectId: string, tab?: string) => void;
}

type PaneTask = Pick<
  Task,
  "id" | "title" | "status" | "priority" | "start_date" | "due_date" | "project_id" | "assigned_to" | "assignees"
> & { projects?: { id: string; name: string } | null };

const SCHEDULE_LIST_SELECT =
  "id, title, start_at, end_at, all_day, location, project_id, created_by, projects:project_id(id, name), attendees:schedule_attendees(id, schedule_id, employee_id, created_at)";

const SCHEDULE_DETAIL_SELECT =
  "*, creator:employees!created_by(id, name), attendees:schedule_attendees(id, schedule_id, employee_id, created_at, employees(id, name, department))";

export function TodayPane({
  projects,
  employees,
  currentEmployeeId,
  onJumpToProject,
}: TodayPaneProps) {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [tasks, setTasks] = useState<PaneTask[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleCategories, setScheduleCategories] = useState<ScheduleCategoryItem[]>([]);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [taskCreateOpen, setTaskCreateOpen] = useState(false);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => toKstDateString());
  const [viewMode, setViewMode] = useState<"day" | "month" | "unassigned">("day");

  const todayStr = toKstDateString();

  const gridRange = useMemo(() => {
    const grid = getMonthGrid(currentMonth);
    const gridStart = grid[0];
    const gridEnd = grid[grid.length - 1];
    return {
      gridStart,
      gridEnd,
      gridStartStr: format(gridStart, "yyyy-MM-dd"),
      gridEndStr: format(gridEnd, "yyyy-MM-dd"),
      gridStartIso: startOfDay(gridStart).toISOString(),
      gridEndIso: addDays(startOfDay(gridEnd), 1).toISOString(),
    };
  }, [currentMonth]);

  const refresh = useCallback(async () => {
    const { gridStartIso, gridEndIso, gridEndStr } = gridRange;
    const [taskRes, schedRes, catRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(`id, title, status, priority, start_date, due_date, project_id, assigned_to, projects:project_id(id, name), assignees:task_assignees(${TASK_ASSIGNEE_SELECT})`)
        .or(`due_date.lte.${gridEndStr},due_date.is.null`)
        .not("status", "in", "(완료,취소)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("priority", { ascending: true }),
      supabase
        .from("schedules")
        .select(SCHEDULE_LIST_SELECT)
        .lt("start_at", gridEndIso)
        .gt("end_at", gridStartIso)
        .order("all_day", { ascending: false })
        .order("start_at", { ascending: true }),
      supabase.from("schedule_categories").select("*").order("sort_order"),
    ]);

    if (!taskRes.error) {
      const normalized = normalizeTaskStatuses((taskRes.data ?? []) as unknown as Task[]);
      const mine = currentEmployeeId
        ? normalized.filter((t) => {
            if (t.assigned_to === currentEmployeeId) return true;
            const assignees = t.assignees ?? [];
            return assignees.some((a) => a.employee_id === currentEmployeeId);
          })
        : [];
      setTasks(mine as unknown as PaneTask[]);
    }
    if (!schedRes.error) {
      const all = (schedRes.data ?? []) as unknown as Schedule[];
      const mine = currentEmployeeId
        ? all.filter((s) => {
            if (s.created_by === currentEmployeeId) return true;
            const attendees = s.attendees ?? [];
            return attendees.some((a) => a.employee_id === currentEmployeeId);
          })
        : [];
      setSchedules(mine);
    }
    if (catRes.data) setScheduleCategories(catRes.data as ScheduleCategoryItem[]);
  }, [supabase, gridRange, currentEmployeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!currentEmployeeId) return;
    const channel = supabase
      .channel(`workspace-today-${currentEmployeeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_attendees" },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, currentEmployeeId, refresh]);

  const isMonthMode = viewMode === "month";
  const isUnassignedMode = viewMode === "unassigned";
  const isOnToday = viewMode === "day" && selectedDate === todayStr;

  const taskDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const range = getTaskDateRange(t as Task);
      if (!range) continue;
      let cursor = range.start;
      while (cursor <= range.end) {
        set.add(cursor);
        const next = new Date(`${cursor}T00:00:00`);
        next.setDate(next.getDate() + 1);
        cursor = format(next, "yyyy-MM-dd");
      }
    }
    return set;
  }, [tasks]);

  const scheduleDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const s of schedules) {
      const { start, end } = getNormalizedScheduleRange(s);
      let cursor = startOfDay(start);
      const endDay = startOfDay(end);
      while (cursor <= endDay) {
        set.add(format(cursor, "yyyy-MM-dd"));
        cursor = addDays(cursor, 1);
      }
    }
    return set;
  }, [schedules]);

  const monthRangeStr = useMemo(() => {
    return {
      start: format(startOfMonth(currentMonth), "yyyy-MM-dd"),
      end: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
    };
  }, [currentMonth]);

  const displayedTasks = useMemo(() => {
    if (isUnassignedMode) {
      return tasks.filter((t) => {
        const status = normalizeTaskStatus(t.status);
        if (status === "완료" || status === "취소") return false;
        return !t.due_date;
      });
    }
    if (isMonthMode) {
      return tasks.filter((t) => {
        const status = normalizeTaskStatus(t.status);
        if (status === "완료" || status === "취소") return false;
        const range = getTaskDateRange(t as Task);
        if (!range) return false;
        return range.start <= monthRangeStr.end && range.end >= monthRangeStr.start;
      });
    }
    return tasks.filter((t) => {
      const status = normalizeTaskStatus(t.status);
      if (status === "완료" || status === "취소") return false;

      if (isOnToday && t.due_date && t.due_date < todayStr) return true;
      if (isOnToday && status === "진행중") return true;

      const range = getTaskDateRange(t as Task);
      if (!range) return false;
      return range.start <= selectedDate && selectedDate <= range.end;
    });
  }, [tasks, selectedDate, todayStr, isOnToday, isMonthMode, isUnassignedMode, monthRangeStr]);

  const overdueCount = useMemo(() => {
    if (!isOnToday) return 0;
    return displayedTasks.filter((t) => t.due_date && t.due_date < todayStr).length;
  }, [displayedTasks, todayStr, isOnToday]);

  const displayedSchedules = useMemo(() => {
    if (isUnassignedMode) return [];
    if (isMonthMode) {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = addDays(endOfMonth(currentMonth), 1);
      return schedules.filter((s) => {
        const { start, end } = getNormalizedScheduleRange(s);
        return start < monthEnd && end > monthStart;
      });
    }
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const dayEnd = addDays(dayStart, 1);
    return schedules.filter((s) => {
      const { start, end } = getNormalizedScheduleRange(s);
      return start < dayEnd && end > dayStart;
    });
  }, [schedules, selectedDate, isMonthMode, isUnassignedMode, currentMonth]);

  const tasksByDate = useMemo(() => {
    if (!isMonthMode) return null;
    const groups = new Map<string, PaneTask[]>();
    for (const t of displayedTasks) {
      const key = t.due_date ?? "(미지정)";
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayedTasks, isMonthMode]);

  const schedulesByDate = useMemo(() => {
    if (!isMonthMode) return null;
    const groups = new Map<string, Schedule[]>();
    for (const s of displayedSchedules) {
      const key = toKstDateString(new Date(s.start_at));
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayedSchedules, isMonthMode]);

  const toggleTask = async (task: PaneTask) => {
    const next = task.status === "완료" ? "할 일" : "완료";
    const previous = task.status;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    const result = await bulkUpdateTasks(supabase, [task.id], { status: next });
    if (!result.ok) {
      toast.error(`상태 변경 실패: ${result.error}`);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: previous } : t)));
    } else if (next === "완료") {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    }
  };

  const handleOpenSchedule = async (scheduleId: string) => {
    const { data, error } = await supabase
      .from("schedules")
      .select(SCHEDULE_DETAIL_SELECT)
      .eq("id", scheduleId)
      .single();
    if (error || !data) {
      toast.error("일정 정보를 불러오지 못했습니다.");
      return;
    }
    setEditingSchedule(data as unknown as Schedule);
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async (
    data: ScheduleInsert,
    attendeeIds: string[],
    recurrence?: { type: RecurrenceType; endDate: string | null },
    options?: { addGoogleMeet?: boolean },
    scope?: ScheduleRecurrenceActionScope
  ): Promise<boolean> => {
    if (new Date(data.end_at).getTime() <= new Date(data.start_at).getTime()) {
      toast.error("종료 일시는 시작 일시보다 이후여야 합니다.");
      return false;
    }

    if (!editingSchedule) {
      const body: Record<string, unknown> = {
        action: "create",
        schedule: data,
        attendeeIds,
        addGoogleMeet: options?.addGoogleMeet,
      };
      if (recurrence && recurrence.type !== "none" && recurrence.endDate) {
        body.recurrence = recurrence;
      }
      const res = await fetch("/api/schedules/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("일정 등록에 실패했습니다.");
        return false;
      }
      toast.success(
        result?.count > 1 ? `반복 일정 ${result.count}건이 등록되었습니다.` : "일정이 등록되었습니다."
      );
      sendLog("CREATE_SCHEDULE", `일정 등록: ${data.title}`, {
        resource: "schedule",
        resource_id: String(result?.id ?? result?.ids?.[0] ?? ""),
      });
      await refresh();
      return true;
    }

    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        scheduleId: editingSchedule.id,
        schedule: data,
        attendeeIds,
        scope,
      }),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error("일정 수정에 실패했습니다.");
      return false;
    }
    toast.success(
      (result?.count ?? 1) > 1
        ? `반복 일정 ${result.count}건이 수정되었습니다.`
        : "일정이 수정되었습니다."
    );
    sendLog("UPDATE_SCHEDULE", `일정 수정: ${data.title}`, {
      resource: "schedule",
      resource_id: editingSchedule.id,
    });
    await refresh();
    return true;
  };

  const handleDeleteSchedule = async (
    scheduleId: string,
    scope?: ScheduleRecurrenceActionScope
  ): Promise<boolean> => {
    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", scheduleId, scope }),
    });
    if (!res.ok) {
      toast.error("일정 삭제에 실패했습니다.");
      return false;
    }
    toast.success("일정이 삭제되었습니다.");
    sendLog("DELETE_SCHEDULE", `일정 삭제`, {
      resource: "schedule",
      resource_id: scheduleId,
    });
    await refresh();
    return true;
  };

  const handleDropTaskOnDate = useCallback(
    async (taskId: string, dateStr: string) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target) return;
      if (target.due_date === dateStr) return;

      const prevDueDate = target.due_date ?? null;
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, due_date: dateStr } : t))
      );

      const result = await bulkUpdateTasks(supabase, [taskId], {
        due_date: dateStr,
      });
      if (!result.ok) {
        toast.error(`마감일 변경 실패: ${result.error}`);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, due_date: prevDueDate } : t))
        );
        return;
      }
      toast.success(
        `마감일을 ${formatKstDateLabel(dateStr)}로 변경했습니다.`
      );
    },
    [tasks, supabase]
  );

  const handleSelectDate = (dateStr: string) => {
    setViewMode("day");
    setSelectedDate(dateStr);
    const target = new Date(`${dateStr}T00:00:00`);
    if (
      target.getFullYear() !== currentMonth.getFullYear() ||
      target.getMonth() !== currentMonth.getMonth()
    ) {
      setCurrentMonth(target);
    }
  };

  const handleToday = () => {
    const today = new Date();
    setViewMode("day");
    setCurrentMonth(today);
    setSelectedDate(toKstDateString(today));
  };

  const handleAllMonth = () => {
    setViewMode("month");
  };

  const handleUnassigned = () => {
    setViewMode("unassigned");
  };

  const renderTaskItem = (task: PaneTask) => {
    const overdue = !isMonthMode && isOnToday && task.due_date && task.due_date < todayStr;
    const dragging = draggingTaskId === task.id;
    return (
      <div
        key={task.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(TASK_DRAG_MIME, task.id);
          e.dataTransfer.effectAllowed = "move";
          setDraggingTaskId(task.id);
        }}
        onDragEnd={() => setDraggingTaskId(null)}
        className={
          "flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-grab active:cursor-grabbing " +
          (overdue ? "border-rose-300 bg-rose-50/50" : "border-border/60 bg-background/80") +
          (dragging ? " opacity-50" : "")
        }
      >
        <Checkbox
          checked={task.status === "완료"}
          onCheckedChange={() => void toggleTask(task)}
          aria-label="완료 토글"
        />
        <button
          type="button"
          onClick={() => {
            setSelectedTaskId(task.id);
            setTaskDialogOpen(true);
          }}
          className="min-w-0 flex-1 truncate text-left text-xs"
        >
          <span className="font-medium text-foreground">{mask("title", task.title)}</span>
          {task.projects?.name ? (
            <span className="ml-1 text-muted-foreground">· {mask("title", task.projects.name)}</span>
          ) : null}
        </button>
        {task.due_date ? (
          <span
            className={
              "shrink-0 text-[10px] " +
              (overdue ? "font-medium text-rose-600" : "text-muted-foreground")
            }
          >
            {formatKstDateLabel(task.due_date)}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground/60">
            미정
          </span>
        )}
      </div>
    );
  };

  const renderScheduleItem = (s: Schedule, options?: { showDate?: boolean }) => {
    const project = Array.isArray(s.projects) ? s.projects[0] : s.projects;
    const showDate = options?.showDate ?? false;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => void handleOpenSchedule(s.id)}
        className="block w-full rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-left text-xs hover:bg-accent/50"
      >
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {showDate
              ? `${formatKstDateLabel(s.start_at)}${s.all_day ? " · 종일" : ` · ${formatKstTime(s.start_at)}`}`
              : s.all_day
                ? "종일"
                : formatKstTime(s.start_at)}
          </span>
          <span className="truncate font-medium text-foreground">{mask("title", s.title)}</span>
        </div>
        {project?.name ? (
          <div className="truncate text-[10px] text-muted-foreground">{mask("title", project.name)}</div>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col border-l border-border/60 bg-background/40">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          {isUnassignedMode
            ? "마감일 미정"
            : isMonthMode
              ? `${format(currentMonth, "yyyy년 M월")} 전체`
              : isOnToday
                ? "오늘"
                : formatKstDateLabel(selectedDate)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {isUnassignedMode
            ? "마감일이 지정되지 않은 할일"
            : isMonthMode
              ? "이번 달 모든 할일·일정"
              : formatKstDateLabel(selectedDate)}
        </div>
      </div>

      <div className="border-b border-border/60 px-3 py-3">
        <TodayPaneMiniCalendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          todayStr={todayStr}
          viewMode={viewMode}
          taskDateSet={taskDateSet}
          scheduleDateSet={scheduleDateSet}
          onPrevMonth={() => setCurrentMonth((d) => subMonths(d, 1))}
          onNextMonth={() => setCurrentMonth((d) => addMonths(d, 1))}
          onSelectDate={handleSelectDate}
          onToday={handleToday}
          onAllMonth={handleAllMonth}
          onUnassigned={handleUnassigned}
          onDropTask={handleDropTaskOnDate}
        />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
        <Section
          icon={<ListTodo className="h-3.5 w-3.5" />}
          title={`${
            isUnassignedMode
              ? "마감일 미정"
              : isMonthMode
                ? "이번 달 할일"
                : isOnToday
                  ? "내 할일"
                  : "할일"
          } ${displayedTasks.length}${overdueCount > 0 ? ` (지연 ${overdueCount})` : ""}`}
          action={
            <button
              type="button"
              onClick={() => setTaskCreateOpen(true)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="할일 추가"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        >
          {displayedTasks.length === 0 ? (
            <Empty>
              {isUnassignedMode
                ? "마감일 미정 할일 없음"
                : isMonthMode
                  ? "이번 달 할일 없음"
                  : isOnToday
                    ? "마감 도래 할일 없음"
                    : "이 날 할일 없음"}
            </Empty>
          ) : isMonthMode && tasksByDate ? (
            tasksByDate.map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground">
                  {dateKey === "(미지정)" ? "마감일 미지정" : formatKstDateLabel(dateKey)}
                </div>
                {items.map((task) => renderTaskItem(task))}
              </div>
            ))
          ) : (
            displayedTasks.map((task) => renderTaskItem(task))
          )}
        </Section>

        {isUnassignedMode ? null : (
        <Section
          icon={<Calendar className="h-3.5 w-3.5" />}
          title={`${
            isMonthMode ? "이번 달 일정" : isOnToday ? "오늘 일정" : "일정"
          } ${displayedSchedules.length}`}
          action={
            <button
              type="button"
              onClick={() => {
                setEditingSchedule(null);
                setScheduleDialogOpen(true);
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="일정 추가"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          }
        >
          {displayedSchedules.length === 0 ? (
            <Empty>
              {isMonthMode
                ? "이번 달 일정 없음"
                : isOnToday
                  ? "오늘 일정 없음"
                  : "이 날 일정 없음"}
            </Empty>
          ) : isMonthMode && schedulesByDate ? (
            schedulesByDate.map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground">
                  {formatKstDateLabel(dateKey)}
                </div>
                {items.map((s) => renderScheduleItem(s))}
              </div>
            ))
          ) : (
            displayedSchedules.map((s) => renderScheduleItem(s))
          )}
        </Section>
        )}
      </div>

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={(next) => {
          setScheduleDialogOpen(next);
          if (!next) setEditingSchedule(null);
        }}
        schedule={editingSchedule}
        employees={employees}
        projects={projects}
        categories={scheduleCategories}
        currentEmployeeId={currentEmployeeId}
        onSave={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
        onJumpToProject={(projectId) => onJumpToProject(projectId, "schedules")}
      />

      <TaskDetailDialog
        taskId={selectedTaskId}
        open={taskDialogOpen}
        onOpenChange={(next) => {
          setTaskDialogOpen(next);
          if (!next) setSelectedTaskId(null);
        }}
        employees={employees}
        projects={projects}
        onUpdated={() => refresh()}
        onDeleted={() => refresh()}
        onJumpToProject={(projectId) => onJumpToProject(projectId, "tasks")}
      />

      <TaskCreateDialog
        open={taskCreateOpen}
        onOpenChange={setTaskCreateOpen}
        employees={employees}
        projects={projects}
        currentEmployeeId={currentEmployeeId}
        defaultDueDate={viewMode === "day" ? selectedDate : todayStr}
        defaultStartDate={viewMode === "day" ? selectedDate : todayStr}
        onCreated={() => refresh()}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

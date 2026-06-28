"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TaskCreateDialog } from "@/components/task-create-dialog";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useMasking } from "@/components/masking-provider";
import { formatKstDateLabel } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import { bulkUpdateTasks } from "@/lib/task-mutations";
import {
  getTaskAssigneeLabel,
  TASK_WITH_ASSIGNEES_SELECT,
} from "@/lib/task-assignees";
import { normalizeTaskStatuses } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import type { Employee, Project, Task } from "@/lib/types";

interface TabTasksProps {
  project: Project;
  projects: Project[];
  employees: Employee[];
  currentEmployeeId: string | null;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "진행중":
      return "bg-sky-100 text-sky-700";
    case "완료":
      return "bg-emerald-100 text-emerald-700";
    case "할 일":
      return "bg-amber-100 text-amber-700";
    case "백로그":
      return "bg-muted text-muted-foreground";
    case "취소":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function priorityClass(priority: string | null | undefined) {
  if (priority === "높음") return "text-rose-600";
  if (priority === "보통") return "text-sky-600";
  return "text-muted-foreground";
}

export function TabTasks({ project, projects, employees, currentEmployeeId }: TabTasksProps) {
  const supabase = useMemo(() => createClient(), []);
  const isMountedRef = useRef(true);
  const { mask } = useMasking();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const employeeNameMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_WITH_ASSIGNEES_SELECT)
      .eq("project_id", project.id)
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true });

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      toast.error("할일 목록을 불러오지 못했습니다.");
      return;
    }
    setTasks(normalizeTaskStatuses((data ?? []) as Task[]));
  }, [project.id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh().finally(() => {
      if (isMountedRef.current) {
        setLoading(false);
      }
    });
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`workspace-tasks-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [project.id, supabase, refresh]);

  const toggleComplete = async (task: Task) => {
    const next = task.status === "완료" ? "할 일" : "완료";
    const previous = task.status;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t))
    );
    const result = await bulkUpdateTasks(supabase, [task.id], { status: next });
    if (!result.ok) {
      toast.error(`상태 변경 실패: ${result.error}`);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: previous } : t))
      );
    }
  };

  const incomplete = tasks.filter((t) => t.status !== "완료" && t.status !== "취소");
  const completed = tasks.filter((t) => t.status === "완료" || t.status === "취소");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          미완료 {incomplete.length}건 · 완료 {completed.length}건
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          할일 추가
        </Button>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          불러오는 중…
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          등록된 할일이 없습니다.
        </div>
      ) : (
        <div className="space-y-1">
          {[...incomplete, ...completed].map((task) => {
            const isDone = task.status === "완료";
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors hover:bg-accent/50",
                  isDone && "opacity-60"
                )}
              >
                <Checkbox
                  checked={isDone}
                  onCheckedChange={() => void toggleComplete(task)}
                  aria-label={isDone ? "미완료로 변경" : "완료로 변경"}
                />
                <button
                  type="button"
                  onClick={() => setDetailTaskId(task.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium tabular-nums",
                      task.due_date ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {task.due_date ? formatKstDateLabel(task.due_date) : "—"}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm text-foreground",
                      isDone && "line-through"
                    )}
                  >
                    {mask("title", task.title)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      statusBadgeClass(task.status)
                    )}
                  >
                    {task.status}
                  </span>
                  <span className={cn("shrink-0 text-[11px]", priorityClass(task.priority))}>
                    {task.priority}
                  </span>
                </button>
                <div className="shrink-0 truncate text-right text-[11px] text-muted-foreground">
                  {getTaskAssigneeLabel(task, employeeNameMap)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        employees={employees}
        projects={projects}
        currentEmployeeId={currentEmployeeId}
        defaultProjectId={project.id}
        onCreated={refresh}
      />

      <TaskDetailDialog
        taskId={detailTaskId}
        open={detailTaskId !== null}
        onOpenChange={(next) => {
          if (!next) setDetailTaskId(null);
        }}
        employees={employees}
        projects={projects}
        onUpdated={refresh}
        onDeleted={async () => {
          setDetailTaskId(null);
          await refresh();
        }}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightCircle, PencilLine, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { TaskForm } from "@/components/task-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendLog } from "@/lib/log-client";
import {
  buildTaskAssigneeRows,
  getTaskAssigneeLabel,
  normalizeTaskAssigneeIds,
  TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT,
} from "@/lib/task-assignees";
import { notifyTaskStatusChanged } from "@/lib/tasks/slack-notify";
import {
  normalizeTaskStatus,
  normalizeTaskStatusItem,
  TASK_STATUS_OPTIONS,
  type TaskDisplayStatus,
} from "@/lib/task-status";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Project, Task, TaskInsert } from "@/lib/types";

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function statusBadgeClass(status: Task["status"]) {
  const s = normalizeTaskStatus(status);
  if (s === "완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "진행중") return "border-sky-200 bg-sky-50 text-sky-700";
  if (s === "취소") return "border-rose-200 bg-rose-50 text-rose-700";
  if (s === "백로그") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-border/70 bg-background/80 text-muted-foreground";
}

function priorityBadgeClass(priority: Task["priority"]) {
  if (priority === "높음") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "보통") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-border/70 bg-background/80 text-muted-foreground";
}

interface TaskDetailDialogProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  projects: Project[];
  onUpdated?: () => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
  onJumpToProject?: (projectId: string) => void;
}

export function TaskDetailDialog({
  taskId,
  open,
  onOpenChange,
  employees,
  projects,
  onUpdated,
  onDeleted,
  onJumpToProject,
}: TaskDetailDialogProps) {
  const supabase = useMemo(() => createClient(), []);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");

  const fetchTask = useCallback(async () => {
    if (!taskId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT)
      .eq("id", taskId)
      .single();

    if (error) {
      toast.error("할일 조회 실패: " + error.message);
      setTask(null);
    } else {
      setTask(normalizeTaskStatusItem(data as Task));
    }
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    if (open && taskId) {
      setMode("view");
      void fetchTask();
    }
    if (!open) {
      setTask(null);
      setMode("view");
      setDeleting(false);
      setStatusSaving(false);
    }
  }, [open, taskId, fetchTask]);

  const employeeNameMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  );

  const assigneeName = task ? getTaskAssigneeLabel(task, employeeNameMap) : "미지정";
  const creatorName = task?.created_by
    ? employees.find((e) => e.id === task.created_by)?.name ?? "-"
    : "-";

  const handleStatusChange = async (newStatus: TaskDisplayStatus) => {
    if (!task || newStatus === task.status) return;

    setStatusSaving(true);

    // 낙관적 업데이트
    const prevStatus = task.status;
    const taskId = task.id;
    setTask((prev) => (prev ? { ...prev, status: newStatus } : prev));

    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (error) {
      toast.error("상태 변경 실패: " + error.message);
      setTask((prev) => (prev ? { ...prev, status: prevStatus } : prev));
      setStatusSaving(false);
      return;
    }

    sendLog("UPDATE_TASK_STATUS", `할일 상태 변경: ${newStatus}`, {
      resource: "task",
      resource_id: taskId,
      details: { status: newStatus },
    });

    if (prevStatus !== newStatus) {
      await notifyTaskStatusChanged(taskId, prevStatus, newStatus);
    }

    toast.success("할일 상태가 변경되었습니다.");
    setStatusSaving(false);
    await onUpdated?.();
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm("이 할일을 삭제하시겠습니까?")) return;

    setDeleting(true);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);

    if (error) {
      toast.error("할일 삭제 실패: " + error.message);
      setDeleting(false);
      return;
    }

    sendLog("DELETE_TASK", `할일 삭제: ${task.title}`, {
      resource: "task",
      resource_id: task.id,
    });

    toast.success("할일이 삭제되었습니다.");
    setDeleting(false);
    onOpenChange(false);
    await onDeleted?.();
  };

  const handleEditSave = async (data: TaskInsert) => {
    if (!task) return;

    const prevStatus = task.status;
    const assigneeIds = normalizeTaskAssigneeIds(data.assignee_ids ?? [data.assigned_to]);
    const payload = {
      title: data.title.trim(),
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      assigned_to: assigneeIds[0] ?? null,
      start_date: data.start_date || null,
      due_date: data.due_date || null,
      project_id: data.project_id || null,
      estimated_minutes: data.estimated_minutes ?? null,
      created_by: data.created_by || null,
    };

    const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);

    if (error) {
      toast.error("할일 수정 실패: " + error.message);
      return;
    }

    const { error: deleteAssigneeError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", task.id);

    if (deleteAssigneeError) {
      toast.error("담당자 갱신 실패: " + deleteAssigneeError.message);
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: insertAssigneeError } = await supabase
        .from("task_assignees")
        .insert(buildTaskAssigneeRows(task.id, assigneeIds));

      if (insertAssigneeError) {
        toast.error("담당자 저장 실패: " + insertAssigneeError.message);
        return;
      }
    }

    sendLog("UPDATE_TASK", `할일 수정: ${payload.title}`, {
      resource: "task",
      resource_id: task.id,
    });

    if (payload.status && prevStatus !== payload.status) {
      await notifyTaskStatusChanged(task.id, prevStatus ?? null, payload.status);
    }

    toast.success("할일이 수정되었습니다.");
    setMode("view");
    await fetchTask();
    await onUpdated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        {loading ? (
          <>
            <DialogHeader>
              <DialogTitle>할일 상세</DialogTitle>
              <DialogDescription>할일 정보를 불러오는 중입니다.</DialogDescription>
            </DialogHeader>
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            </div>
          </>
        ) : !task ? (
          <>
            <DialogHeader>
              <DialogTitle>할일 상세</DialogTitle>
              <DialogDescription>할일을 찾을 수 없습니다.</DialogDescription>
            </DialogHeader>
            <p className="py-8 text-center text-sm text-muted-foreground">
              삭제되었거나 접근할 수 없는 항목일 수 있습니다.
            </p>
          </>
        ) : mode === "edit" ? (
          <>
            <DialogHeader>
              <DialogTitle>할일 수정</DialogTitle>
              <DialogDescription>
                할일 정보와 상태를 수정합니다.
              </DialogDescription>
            </DialogHeader>
            <TaskForm
              task={task}
              employees={employees}
              projects={projects}
              createdBy={task.created_by}
              defaultProjectId={task.project_id}
              onSave={handleEditSave}
              onCancel={() => setMode("view")}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>{task.title}</span>
                <Badge variant="outline" className={statusBadgeClass(task.status)}>
                  {task.status}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                할일 상세 정보를 확인하고, 상태를 변경하거나 수정/삭제할 수 있습니다.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 shadow-sm">
                <span className="text-xs font-medium text-muted-foreground">상태</span>
                <select
                  value={normalizeTaskStatus(task.status)}
                  onChange={(e) =>
                    void handleStatusChange(e.target.value as TaskDisplayStatus)
                  }
                  disabled={statusSaving || deleting}
                  className="h-7 bg-transparent text-sm outline-none disabled:opacity-50"
                >
                  {TASK_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              {onJumpToProject && task.project_id ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onJumpToProject(task.project_id!);
                    onOpenChange(false);
                  }}
                  disabled={deleting}
                >
                  <ArrowRightCircle className="h-4 w-4" />
                  프로젝트로 이동
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode("edit")}
                disabled={deleting}
              >
                <PencilLine className="h-4 w-4" />
                수정
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/10 px-4 py-3">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow
                  label="우선순위"
                  value={
                    <Badge
                      variant="outline"
                      className={priorityBadgeClass(task.priority)}
                    >
                      {task.priority}
                    </Badge>
                  }
                />
                <InfoRow label="담당자" value={assigneeName} />
                <InfoRow label="마감일" value={formatDate(task.due_date)} />
                <InfoRow
                  label="프로젝트"
                  value={
                    task.projects ? (
                      onJumpToProject ? (
                        <button
                          type="button"
                          onClick={() => {
                            onJumpToProject(task.projects!.id);
                            onOpenChange(false);
                          }}
                          className="truncate text-left font-medium text-primary hover:underline"
                        >
                          {task.projects.project_number
                            ? `${task.projects.project_number} · ${task.projects.name}`
                            : task.projects.name}
                        </button>
                      ) : (
                        <Link
                          href={`/dashboard/projects/${task.projects.id}`}
                          className="truncate font-medium text-primary hover:underline"
                        >
                          {task.projects.project_number
                            ? `${task.projects.project_number} · ${task.projects.name}`
                            : task.projects.name}
                        </Link>
                      )
                    ) : (
                      <span className="text-muted-foreground">미연결</span>
                    )
                  }
                />
                <InfoRow
                  label="등록"
                  value={`${creatorName} · ${formatDate(task.created_at)}`}
                />
                <InfoRow label="수정일" value={formatDate(task.updated_at)} />
              </dl>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">할일 설명</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">
                  {task.description?.trim() || "등록된 설명이 없습니다."}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="w-16 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}

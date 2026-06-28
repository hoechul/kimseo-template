"use client";

import Link from "next/link";
import { CalendarClock, PencilLine, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendLog } from "@/lib/log-client";
import {
  getTaskAssigneeLabel,
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
import type { Employee, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function statusBadgeClass(status: Task["status"]) {
  const normalizedStatus = normalizeTaskStatus(status);

  if (normalizedStatus === "완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalizedStatus === "진행중") return "border-sky-200 bg-sky-50 text-sky-700";
  if (normalizedStatus === "취소") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalizedStatus === "백로그") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-border/70 bg-background/80 text-muted-foreground";
}

function priorityBadgeClass(priority: Task["priority"]) {
  if (priority === "높음") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "보통") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-border/70 bg-background/80 text-muted-foreground";
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [task, setTask] = useState<Task | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<TaskDisplayStatus>("할 일");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      await supabase.auth.getSession();

      const [taskRes, employeeRes] = await Promise.all([
        supabase
          .from("tasks")
          .select(TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT)
          .eq("id", taskId)
          .single(),
        supabase.from("employees").select("id, name").order("name").limit(500),
      ]);

      if (cancelled) return;

      if (taskRes.error) {
        console.error("할일 조회 실패:", taskRes.error.message);
        toast.error("할일 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setTask(null);
      } else {
        const data = normalizeTaskStatusItem(taskRes.data as Task);
        setTask(data);
        setSelectedStatus(data.status);
      }

      if (employeeRes.error) {
        console.error("직원 조회 실패:", employeeRes.error.message);
        toast.error("직원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setEmployees([]);
      } else {
        setEmployees((employeeRes.data ?? []) as Employee[]);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, taskId]);

  const employeeNameMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees]
  );

  const rawAssigneeName = task ? getTaskAssigneeLabel(task, employeeNameMap) : "미지정";
  const assigneeName = rawAssigneeName === "미지정" ? rawAssigneeName : mask("name", rawAssigneeName);

  const rawCreatorName = task?.created_by
    ? employees.find((employee) => employee.id === task.created_by)?.name ?? "-"
    : "-";
  const creatorName = rawCreatorName === "-" ? rawCreatorName : mask("name", rawCreatorName);

  const handleDelete = async () => {
    if (!confirm("이 할일을 삭제하시겠습니까?")) return;

    setDeleting(true);
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) {
      console.error("할일 삭제 실패:", error.message);
      toast.error("할일 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }

    sendLog("DELETE_TASK", `할일 삭제: ${task?.title}`, {
      resource: "task",
      resource_id: taskId,
    });

    toast.success("할일이 삭제되었습니다.");
    router.push("/dashboard/tasks");
  };

  const handleStatusChange = async (newStatus: TaskDisplayStatus) => {
    if (!task || newStatus === task.status) return;

    const prevStatus = task.status;
    setSelectedStatus(newStatus);
    setStatusSaving(true);
    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);

    if (error) {
      console.error("상태 변경 실패:", error.message);
      toast.error("상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setSelectedStatus(normalizeTaskStatus(task.status));
      setStatusSaving(false);
      return;
    }

    sendLog("UPDATE_TASK_STATUS", `할일 상태 변경: ${newStatus}`, {
      resource: "task",
      resource_id: taskId,
      details: { status: newStatus },
    });

    setTask((prev) => (prev ? { ...prev, status: newStatus } : prev));

    if (prevStatus !== newStatus) {
      await notifyTaskStatusChanged(taskId, prevStatus, newStatus);
    }

    toast.success("할일 상태가 변경되었습니다.");
    setStatusSaving(false);
  };

  if (loading) {
    return (
      <LoadingState
        title="할일 정보를 불러오는 중입니다."
        description="담당자와 프로젝트 연결 상태를 함께 준비하고 있습니다."
      />
    );
  }

  if (!task) {
    return (
      <ErrorState
        title="할일을 찾을 수 없습니다."
        description="삭제되었거나 접근할 수 없는 항목일 수 있습니다."
        action={
          <Button variant="outline" onClick={() => router.push("/dashboard/tasks")}>
            목록으로 돌아가기
          </Button>
        }
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "할일관리", href: "/dashboard/tasks" },
          { label: mask("title", task.title) },
        ]}
        title={mask("title", task.title)}
        funKey="tasks"
        titleAccessory={
          <Badge variant="outline" className={statusBadgeClass(task.status)}>
            {task.status}
          </Badge>
        }
        description="상태를 즉시 변경하고, 담당자와 연결 프로젝트를 한 화면에서 확인할 수 있습니다."
        actions={
          <>
            <div className="flex min-w-[180px] items-center gap-3 rounded-[1rem] border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
              <span className="text-xs font-medium text-muted-foreground">상태</span>
              <select
                value={selectedStatus}
                onChange={(event) => void handleStatusChange(event.target.value as TaskDisplayStatus)}
                disabled={statusSaving || deleting}
                className="h-8 flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
              >
                {TASK_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/tasks/${taskId}/edit`}>
                <PencilLine className="h-4 w-4" />
                수정
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              <Trash2 className="h-4 w-4" />
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </>
        }
      />

      <Card className="gap-0 overflow-hidden">
        <CardHeader className="border-b border-border/60 pb-5">
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(240px,0.9fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <BasicInfoField
                label="우선순위"
                value={
                  <Badge variant="outline" className={priorityBadgeClass(task.priority)}>
                    {task.priority}
                  </Badge>
                }
              />
              <BasicInfoField label="담당자" value={assigneeName} />
              <BasicInfoField label="마감일" value={formatDate(task.due_date)} />
              <BasicInfoField
                label="연결 프로젝트"
                className="sm:col-span-2"
                value={
                  task.projects ? (
                    <Link href={`/dashboard/projects/${task.projects.id}`} className="font-medium text-primary hover:underline">
                      {task.projects.project_number ? `${task.projects.project_number} · ${mask("title", task.projects.name)}` : mask("title", task.projects.name)}
                    </Link>
                  ) : (
                    "미연결"
                  )
                }
              />
            </div>

            <div className="rounded-[1.25rem] border border-border/60 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                등록 이력
              </p>
              <div className="mt-4 space-y-4">
                <HistoryRow label="등록자" value={creatorName} />
                <HistoryRow label="등록일" value={formatDate(task.created_at)} />
                <HistoryRow label="수정일" value={formatDate(task.updated_at)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            할일 설명
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {task.description?.trim() || "등록된 설명이 없습니다."}
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function BasicInfoField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border border-border/60 bg-muted/20 px-4 py-3",
        className
      )}
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium leading-6 text-foreground">
        {value}
      </div>
    </div>
  );
}

function HistoryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

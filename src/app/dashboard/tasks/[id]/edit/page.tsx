"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeTaskStatusItem } from "@/lib/task-status";
import { sendLog } from "@/lib/log-client";
import { buildTaskAssigneeRows, normalizeTaskAssigneeIds, TASK_WITH_ASSIGNEES_SELECT } from "@/lib/task-assignees";
import { notifyTaskStatusChanged } from "@/lib/tasks/slack-notify";
import { Button } from "@/components/ui/button";
import { TaskForm } from "@/components/task-form";
import { LoadingState } from "@/components/page-shell";
import type { Employee, Project, Task, TaskInsert } from "@/lib/types";

export default function EditTaskPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [task, setTask] = useState<Task | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    await supabase.auth.getSession();

    const [taskRes, employeeRes, projectRes] = await Promise.all([
      supabase.from("tasks").select(TASK_WITH_ASSIGNEES_SELECT).eq("id", taskId).single(),
      supabase.from("employees").select("id, name").order("name").limit(500),
      supabase.from("projects").select("id, project_number, name").order("created_at", { ascending: false }).limit(500),
    ]);

    if (taskRes.error) {
      console.error("할일 조회 실패:", taskRes.error.message);
      toast.error("할일 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setTask(null);
    } else {
      setTask(normalizeTaskStatusItem(taskRes.data as Task));
    }

    if (employeeRes.error) {
      console.error("직원 조회 실패:", employeeRes.error.message);
      toast.error("직원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setEmployees([]);
    } else {
      setEmployees((employeeRes.data ?? []) as Employee[]);
    }

    if (projectRes.error) {
      console.error("프로젝트 목록 조회 실패:", projectRes.error.message);
      toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setProjects([]);
    } else {
      setProjects((projectRes.data ?? []) as Project[]);
    }

    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchData]);

  const handleSave = async (data: TaskInsert) => {
    const prevStatus = task?.status ?? null;
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

    const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);

    if (error) {
      console.error("할일 수정 실패:", error.message);
      toast.error("할일 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const { error: deleteAssigneeError } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId);

    if (deleteAssigneeError) {
      console.error("담당자 갱신 실패:", deleteAssigneeError.message);
      toast.error("담당자 갱신에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: insertAssigneeError } = await supabase
        .from("task_assignees")
        .insert(buildTaskAssigneeRows(taskId, assigneeIds));

      if (insertAssigneeError) {
        console.error("담당자 저장 실패:", insertAssigneeError.message);
        toast.error("담당자 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
    }

    sendLog("UPDATE_TASK", `할일 수정: ${payload.title}`, {
      resource: "task",
      resource_id: taskId,
    });

    if (payload.status && prevStatus !== payload.status) {
      await notifyTaskStatusChanged(taskId, prevStatus ?? null, payload.status);
    }

    toast.success("할일이 수정되었습니다.");
    router.push(`/dashboard/tasks/${taskId}`);
  };

  if (loading) {
    return <LoadingState title="할일 정보를 불러오는 중입니다." />;
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">할일을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/tasks")}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">할일 수정</h3>
        <p className="text-sm text-muted-foreground">할일 정보와 상태를 수정합니다.</p>
      </div>

      <TaskForm
        task={task}
        employees={employees}
        projects={projects}
        createdBy={task.created_by}
        defaultProjectId={task.project_id}
        onSave={handleSave}
        onCancel={() => router.push(`/dashboard/tasks/${taskId}`)}
      />
    </div>
  );
}

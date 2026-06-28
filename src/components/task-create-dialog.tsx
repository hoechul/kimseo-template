"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { TaskForm } from "@/components/task-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendLog } from "@/lib/log-client";
import { buildTaskAssigneeRows, normalizeTaskAssigneeIds } from "@/lib/task-assignees";
import { notifyTaskCreated } from "@/lib/tasks/slack-notify";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Project, TaskInsert } from "@/lib/types";

interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  projects: Project[];
  currentEmployeeId: string | null;
  defaultProjectId?: string | null;
  defaultDueDate?: string | null;
  defaultStartDate?: string | null;
  onCreated?: () => Promise<void> | void;
}

export function TaskCreateDialog({
  open,
  onOpenChange,
  employees,
  projects,
  currentEmployeeId,
  defaultProjectId = null,
  defaultDueDate = null,
  defaultStartDate = null,
  onCreated,
}: TaskCreateDialogProps) {
  const supabase = useMemo(() => createClient(), []);

  const handleSave = async (data: TaskInsert) => {
    const { data: maxRow } = await supabase
      .from("tasks")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const assigneeIds = normalizeTaskAssigneeIds(data.assignee_ids ?? [data.assigned_to]);
    const payload = {
      title: data.title.trim(),
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      assigned_to: assigneeIds[0] ?? null,
      start_date: data.start_date || null,
      due_date: data.due_date || null,
      project_id: data.project_id || defaultProjectId || null,
      estimated_minutes: data.estimated_minutes ?? null,
      created_by: data.created_by || currentEmployeeId || null,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
    };

    const { data: inserted, error } = await supabase.from("tasks").insert(payload).select("id").single();

    if (error) {
      toast.error(`할일 추가에 실패했습니다. ${error.message}`);
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert(buildTaskAssigneeRows(inserted.id, assigneeIds));

      if (assigneeError) {
        await supabase.from("tasks").delete().eq("id", inserted.id);
        toast.error(`담당자 저장에 실패했습니다. ${assigneeError.message}`);
        return;
      }
    }

    sendLog("CREATE_TASK", `할일 추가: ${payload.title}`, {
      resource: "task",
      resource_id: inserted.id,
    });

    await notifyTaskCreated(inserted.id);

    toast.success("할일이 추가되었습니다.");
    onOpenChange(false);
    await onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>할일 추가</DialogTitle>
          <DialogDescription>
            제목, 상태, 담당자, 프로젝트를 한 번에 입력하고 저장할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <TaskForm
          task={null}
          employees={employees}
          projects={projects}
          createdBy={currentEmployeeId}
          defaultProjectId={defaultProjectId}
          defaultDueDate={defaultDueDate}
          defaultStartDate={defaultStartDate}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

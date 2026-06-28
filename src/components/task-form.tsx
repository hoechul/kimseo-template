"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

import { getTaskAssigneeIds, normalizeTaskAssigneeIds } from "@/lib/task-assignees";
import { normalizeTaskStatus, TASK_STATUS_OPTIONS, type TaskDisplayStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";
import type {
  Employee,
  Project,
  Task,
  TaskInsert,
  TaskPriority,
} from "@/lib/types";

const PRIORITY_OPTIONS: TaskPriority[] = ["높음", "보통", "낮음"];

interface TaskFormProps {
  task: Task | null;
  employees: Employee[];
  projects: Project[];
  createdBy: string | null;
  defaultProjectId?: string | null;
  defaultDueDate?: string | null;
  defaultStartDate?: string | null;
  onSave: (data: TaskInsert) => Promise<void>;
  onCancel: () => void;
}

function createEmptyTask(
  createdBy: string | null,
  defaultDueDate?: string | null,
  defaultStartDate?: string | null,
): TaskInsert {
  return {
    title: "",
    description: "",
    status: "할 일",
    priority: "보통",
    assigned_to: createdBy,
    assignee_ids: createdBy ? [createdBy] : [],
    start_date: defaultStartDate ?? null,
    due_date: defaultDueDate ?? "",
    project_id: null,
    sort_order: 0,
    estimated_minutes: null,
    actual_minutes: null,
    started_at: null,
    completed_at: null,
    created_by: createdBy,
  };
}

const ESTIMATED_PRESETS = [15, 30, 60, 120];

const fieldClass =
  "flex h-10 w-full rounded-xl border border-input/85 bg-background/80 px-3.5 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function TaskForm({
  task,
  employees,
  projects,
  createdBy,
  defaultProjectId,
  defaultDueDate,
  defaultStartDate,
  onSave,
  onCancel,
}: TaskFormProps) {
  const [form, setForm] = useState<TaskInsert>(
    createEmptyTask(createdBy, defaultDueDate, defaultStartDate),
  );
  const [saving, setSaving] = useState(false);
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description,
        status: normalizeTaskStatus(task.status),
        priority: task.priority,
        assigned_to: task.assigned_to,
        assignee_ids: getTaskAssigneeIds(task),
        start_date: task.start_date,
        due_date: task.due_date,
        project_id: task.project_id,
        sort_order: task.sort_order,
        estimated_minutes: task.estimated_minutes ?? null,
        actual_minutes: task.actual_minutes ?? null,
        started_at: task.started_at ?? null,
        completed_at: task.completed_at ?? null,
        created_by: task.created_by,
      });
      return;
    }

    setForm({
      ...createEmptyTask(createdBy, defaultDueDate, defaultStartDate),
      project_id: defaultProjectId ?? null,
    });
  }, [task, createdBy, defaultProjectId, defaultDueDate, defaultStartDate]);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );
  const selectedAssigneeIds = form.assignee_ids ?? [];
  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.id === form.project_id) ?? null,
    [sortedProjects, form.project_id]
  );
  const selectedProjectLabel = selectedProject
    ? selectedProject.project_number
      ? `[${selectedProject.project_number}] ${selectedProject.name}`
      : selectedProject.name
    : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error("제목을 입력해주세요.");
      return;
    }

    setSaving(true);

    try {
      const assigneeIds = normalizeTaskAssigneeIds(form.assignee_ids ?? []);

      await onSave({
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        assigned_to: assigneeIds[0] ?? null,
        assignee_ids: assigneeIds,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        project_id: form.project_id || null,
        created_by: form.created_by || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleAssignee = (employeeId: string, checked: boolean) => {
    setForm((prev) => {
      const nextAssigneeIds = checked
        ? normalizeTaskAssigneeIds([...(prev.assignee_ids ?? []), employeeId])
        : (prev.assignee_ids ?? []).filter((id) => id !== employeeId);

      return {
        ...prev,
        assigned_to: nextAssigneeIds[0] ?? null,
        assignee_ids: nextAssigneeIds,
      };
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="surface-panel px-5 py-5 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-title">할일 제목</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="예: 3월 프로젝트 일정 확정"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-priority">우선순위</Label>
            <select
              id="task-priority"
              value={form.priority}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, priority: event.target.value as TaskPriority }))
              }
              className={fieldClass}
            >
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-status">상태</Label>
            <select
              id="task-status"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as TaskDisplayStatus }))
              }
              className={fieldClass}
            >
              {TASK_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>담당자</Label>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border border-input/85 bg-background/80 p-2 shadow-sm">
              {sortedEmployees.map((employee) => (
                <label
                  key={employee.id}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={selectedAssigneeIds.includes(employee.id)}
                    onCheckedChange={(checked) => toggleAssignee(employee.id, Boolean(checked))}
                  />
                  <span>{employee.name}</span>
                  {employee.department && (
                    <span className="text-xs text-muted-foreground">{employee.department}</span>
                  )}
                </label>
              ))}
              {sortedEmployees.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  등록된 직원이 없습니다.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-start-date">시작일 (선택)</Label>
            <DateInput
              id="task-start-date"
              value={form.start_date ?? ""}
              onChange={(value) => setForm((prev) => ({ ...prev, start_date: value || null }))}
            />
            <p className="text-xs text-muted-foreground">
              기간이 있는 할일은 시작일을 지정하면 주간 타임라인에서 구간으로 표시됩니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due-date">마감일</Label>
            <DateInput
              id="task-due-date"
              value={form.due_date ?? ""}
              onChange={(value) => setForm((prev) => ({ ...prev, due_date: value }))}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-estimated-minutes">예상 소요 시간 (분)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {ESTIMATED_PRESETS.map((preset) => {
                const isActive = form.estimated_minutes === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        estimated_minutes: isActive ? null : preset,
                      }))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                    )}
                  >
                    {preset}분
                  </button>
                );
              })}
              <input
                id="task-estimated-minutes"
                type="number"
                min={1}
                placeholder="직접 입력"
                value={form.estimated_minutes ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    estimated_minutes: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="h-8 w-28 rounded-lg border border-input/85 bg-background/80 px-2 text-sm shadow-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              집중 모드에서 타이머 길이로 사용됩니다.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-project">연결 프로젝트</Label>
            <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="task-project"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={projectPopoverOpen}
                  className="h-10 w-full justify-between rounded-xl border border-input/85 bg-background/80 px-3.5 font-normal shadow-sm"
                >
                  <span className={cn("truncate", !selectedProject && "text-muted-foreground")}>
                    {selectedProjectLabel ?? "프로젝트명, 번호로 검색하세요"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    const project = sortedProjects.find((item) => item.id === value);
                    if (!project) return 0;
                    const keyword = search.toLowerCase();
                    if (project.name.toLowerCase().includes(keyword)) return 1;
                    if (project.project_number?.toLowerCase().includes(keyword)) return 1;
                    if (project.client?.toLowerCase().includes(keyword)) return 1;
                    return 0;
                  }}
                >
                  <CommandInput placeholder="프로젝트명, 번호 검색..." />
                  <CommandList>
                    <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                    <CommandGroup>
                      {sortedProjects.map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.id}
                          onSelect={(value) => {
                            setForm((prev) => ({
                              ...prev,
                              project_id: value === prev.project_id ? null : value,
                            }));
                            setProjectPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.project_id === project.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">
                            {project.project_number ? `[${project.project_number}] ` : ""}
                            {project.name}
                            {project.client ? ` - ${project.client}` : ""}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedProject && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setForm((prev) => ({ ...prev, project_id: null }))}
              >
                프로젝트 연결 해제
              </button>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-description">상세 설명</Label>
            <textarea
              id="task-description"
              value={form.description ?? ""}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={10}
              className="min-h-44 w-full rounded-[1.25rem] border border-input/85 bg-background/80 px-4 py-3 text-sm shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="할일 배경, 전달 사항, 완료 기준을 정리해 주세요"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "저장 중..." : task ? "할일 수정" : "할일 추가"}
        </Button>
      </div>
    </form>
  );
}

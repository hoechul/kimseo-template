"use client";

import { Check } from "lucide-react";

import { priorityBadgeClass, statusBadgeClass } from "@/components/tasks/task-row-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeTaskStatus, TASK_STATUS_OPTIONS, type TaskDisplayStatus } from "@/lib/task-status";
import type { Employee, Project, Task, TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TaskQuickAddDialog({
  open,
  onOpenChange,
  status,
  assigneeNames,
  assigneeHint,
  title,
  onTitleChange,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: TaskDisplayStatus;
  assigneeNames: string[];
  assigneeHint: string;
  title: string;
  onTitleChange: (value: string) => void;
  saving: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{status} 빠른 추가</DialogTitle>
          <DialogDescription>
            현재 필터 기준으로 아래 상태와 담당자에 등록됩니다.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">진행상태</p>
              <Badge variant="outline" className={cn("w-fit", statusBadgeClass(status))}>
                {status}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">담당자</p>
              <div className="flex flex-wrap gap-2">
                {assigneeNames.length > 0 ? (
                  assigneeNames.map((name) => (
                    <Badge key={name} variant="secondary">
                      {name}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary">미배정</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{assigneeHint}</p>
            </div>
          </div>
          <Input
            autoFocus
            placeholder="할일 제목을 입력하세요"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={saving}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "등록 중..." : "등록"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskStatusChangeDialog({
  task,
  updatingTaskId,
  onClose,
  onSelect,
}: {
  task: Task | null;
  updatingTaskId: string | null;
  onClose: () => void;
  onSelect: (status: TaskDisplayStatus) => void;
}) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>상태 변경</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {TASK_STATUS_OPTIONS.map((status) => {
            const isCurrent = Boolean(task && normalizeTaskStatus(task.status) === status);
            const isUpdating = Boolean(task && updatingTaskId === task.id);

            return (
              <Button
                key={status}
                type="button"
                variant="outline"
                className={cn(
                  "h-auto justify-start rounded-xl border px-4 py-3 text-left font-medium",
                  statusBadgeClass(status),
                  isCurrent && "ring-2 ring-primary/20",
                  isUpdating && "cursor-not-allowed opacity-60"
                )}
                onClick={() => onSelect(status)}
                disabled={!task || isUpdating}
              >
                {status}
              </Button>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDueDateDialog({
  task,
  updatingTaskId,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: {
  task: Task | null;
  updatingTaskId: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>마감일 변경</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Label htmlFor="task-due-date-modal">마감일</Label>
          <Input
            id="task-due-date-modal"
            type="date"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onDraftChange("")}
            disabled={!task || updatingTaskId === task.id}
          >
            날짜 지우기
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!task || updatingTaskId === task.id}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskPriorityDialog({
  task,
  updatingTaskId,
  onClose,
  onSelect,
}: {
  task: Task | null;
  updatingTaskId: string | null;
  onClose: () => void;
  onSelect: (priority: TaskPriority) => void;
}) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>우선순위 변경</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {(["높음", "보통", "낮음"] as const).map((priority) => {
            const isCurrent = task?.priority === priority;
            const isUpdating = Boolean(task && updatingTaskId === task.id);

            return (
              <Button
                key={priority}
                type="button"
                variant="outline"
                className={cn(
                  "h-auto justify-start rounded-xl border px-4 py-3 text-left font-medium",
                  priorityBadgeClass(priority),
                  isCurrent && "ring-2 ring-primary/20",
                  isUpdating && "cursor-not-allowed opacity-60"
                )}
                onClick={() => onSelect(priority)}
                disabled={!task || isUpdating}
              >
                {priority}
              </Button>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskAssigneeDialog({
  task,
  updatingTaskId,
  employees,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: {
  task: Task | null;
  updatingTaskId: string | null;
  employees: Employee[];
  draft: string[];
  onDraftChange: (next: string[]) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>담당자 변경</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto rounded-xl border border-input/85 bg-background/80 p-2 shadow-sm">
          {employees
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((employee) => (
              <label
                key={employee.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/70 px-3 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={draft.includes(employee.id)}
                  onCheckedChange={(checked) => {
                    onDraftChange(
                      checked
                        ? [...draft, employee.id]
                        : draft.filter((id) => id !== employee.id)
                    );
                  }}
                />
                <span>{employee.name}</span>
              </label>
            ))}
          {employees.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              등록된 직원이 없습니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!task || updatingTaskId === task.id}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TaskProjectLinkDialog({
  task,
  projects,
  onClose,
  onChange,
}: {
  task: Task | null;
  projects: Project[];
  onClose: () => void;
  onChange: (taskId: string, projectId: string | null) => void;
}) {
  return (
    <Dialog
      open={Boolean(task)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>프로젝트 연결</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <Command
          filter={(value, search) => {
            const project = projects.find((item) => item.id === value);
            if (!project) return 0;
            const keyword = search.toLowerCase();
            if (project.name.toLowerCase().includes(keyword)) return 1;
            if (project.project_number?.toLowerCase().includes(keyword)) return 1;
            if (project.client?.toLowerCase().includes(keyword)) return 1;
            return 0;
          }}
        >
          <CommandInput placeholder="프로젝트명, 번호, 고객사 검색..." />
          <CommandList className="max-h-60">
            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
            <CommandGroup>
              {projects.map((project) => {
                const isSelected = task?.project_id === project.id;
                return (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    onSelect={() => {
                      if (!task) return;
                      onChange(task.id, isSelected ? null : project.id);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">
                      {project.project_number ? `[${project.project_number}] ` : ""}
                      {project.name}
                      {project.client ? ` - ${project.client}` : ""}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {task?.project_id && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start text-muted-foreground"
            onClick={() => onChange(task.id, null)}
          >
            프로젝트 연결 해제
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

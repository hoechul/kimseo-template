import { FolderOpen } from "lucide-react";

import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { normalizeTaskStatus } from "@/lib/task-status";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export function priorityBadgeClass(priority: Task["priority"]) {
  if (priority === "높음") return "bg-red-100 text-red-700";
  if (priority === "보통") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
}

export function statusBadgeClass(status: Task["status"]) {
  const normalizedStatus = normalizeTaskStatus(status);

  if (normalizedStatus === "완료") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalizedStatus === "진행중") return "border-sky-200 bg-sky-50 text-sky-700";
  if (normalizedStatus === "취소") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalizedStatus === "백로그") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function formatDueDateShort(dueDate: string | null) {
  if (!dueDate) return "-";
  const [, month, day] = dueDate.split("-");
  if (!month || !day) return dueDate;
  return `${month}/${day}`;
}

export function TaskDueDateButton({
  task,
  updatingTaskId,
  onOpen,
  compact = false,
}: {
  task: Task;
  updatingTaskId: string | null;
  onOpen: (task: Task) => void;
  compact?: boolean;
}) {
  const isUpdating = updatingTaskId === task.id;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center rounded-md text-sm transition-colors hover:text-foreground",
        compact ? "text-xs text-muted-foreground" : "text-muted-foreground",
        isUpdating && "cursor-not-allowed opacity-60"
      )}
      onClick={() => onOpen(task)}
      disabled={isUpdating}
      aria-label={`${task.title} 마감일 변경`}
    >
      {compact ? formatDueDateShort(task.due_date) : task.due_date ?? "-"}
    </button>
  );
}

export function TaskStatusControl({
  task,
  updatingTaskId,
  onOpen,
}: {
  task: Task;
  updatingTaskId: string | null;
  onOpen: (task: Task) => void;
}) {
  const taskStatus = normalizeTaskStatus(task.status);
  const isUpdating = updatingTaskId === task.id;

  return (
    <button
      type="button"
      className="inline-flex"
      onClick={() => onOpen(task)}
      disabled={isUpdating}
      aria-label={`${task.title} 상태 변경`}
    >
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 cursor-pointer font-medium transition-colors hover:border-foreground/20 hover:bg-accent",
          isUpdating && "cursor-not-allowed opacity-60",
          statusBadgeClass(task.status)
        )}
      >
        {taskStatus}
      </Badge>
    </button>
  );
}

export function TaskProjectTag({
  task,
  onLink,
}: {
  task: Task;
  onLink?: (task: Task) => void;
}) {
  const { mask } = useMasking();

  if (!task.projects?.name) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onLink?.(task);
        }}
        className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted/70 hover:text-foreground"
      >
        <FolderOpen className="size-3 shrink-0" />
        <span>프로젝트 미연결</span>
      </button>
    );
  }

  const maskedName = mask("title", task.projects.name);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onLink?.(task);
      }}
      className="inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-100 hover:text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:border-blue-400 dark:hover:bg-blue-950/50 dark:hover:text-blue-300"
    >
      <span className="truncate">
        {task.projects.project_number ? `${task.projects.project_number} · ${maskedName}` : maskedName}
      </span>
    </button>
  );
}

export function GripIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-muted-foreground"
    >
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

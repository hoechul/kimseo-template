"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";

import { useMasking } from "@/components/masking-provider";
import { TaskProjectTag } from "@/components/tasks/task-row-parts";
import { getTaskAssigneeLabel, getTaskAssigneeNames } from "@/lib/task-assignees";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

function priorityBarClass(priority: Task["priority"]) {
  if (priority === "높음") return "bg-red-500";
  if (priority === "보통") return "bg-sky-500";
  return "bg-gray-300";
}

function formatDueDateShort(dueDate: string | null) {
  if (!dueDate) return null;
  const [, month, day] = dueDate.split("-");
  if (!month || !day) return dueDate;
  return `${month}/${day}`;
}

function dueDateBadgeClass(dueDate: string | null, status: Task["status"]) {
  if (!dueDate) return "text-muted-foreground";
  if (status === "완료" || status === "취소") return "text-muted-foreground";
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate < today) return "text-rose-600 font-medium";
  if (dueDate === today) return "text-amber-600 font-medium";
  return "text-sky-600";
}

export function TaskCardBody({ task, assigneeMap, onOpenProjectLink }: {
  task: Task;
  assigneeMap: Map<string, string>;
  onOpenProjectLink: (task: Task) => void;
}) {
  const { mask } = useMasking();
  const dueBadge = formatDueDateShort(task.due_date);
  const assigneeNames = getTaskAssigneeNames(task, assigneeMap);
  const maskedAssigneeLabel =
    assigneeNames.length > 0
      ? assigneeNames.map((name) => mask("name", name)).join(", ")
      : getTaskAssigneeLabel(task, assigneeMap);

  return (
    <>
      <div className={cn("w-1 shrink-0 rounded-full", priorityBarClass(task.priority))} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="break-words text-sm font-medium text-foreground">{mask("title", task.title)}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {maskedAssigneeLabel}
          </span>
          {dueBadge ? (
            <span className={cn("text-[11px]", dueDateBadgeClass(task.due_date, task.status))}>
              {dueBadge}
            </span>
          ) : null}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <TaskProjectTag task={task} onLink={onOpenProjectLink} />
        </div>
      </div>
    </>
  );
}

/** 칸반 보드 전용: DndContext 내에서만 사용 가능 */
export function KanbanCard({
  task,
  assigneeMap,
  onNavigate,
  onOpenProjectLink,
}: {
  task: Task;
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status, type: "task" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onNavigate(task.id)}
      className="group flex cursor-grab gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-foreground/30 active:cursor-grabbing"
    >
      <TaskCardBody task={task} assigneeMap={assigneeMap} onOpenProjectLink={onOpenProjectLink} />
    </div>
  );
}

/** 일간/주간 뷰처럼 DndContext 바깥에서 쓰는 정적 카드 */
export function TaskStaticCard({
  task,
  assigneeMap,
  onNavigate,
  onOpenProjectLink,
}: {
  task: Task;
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(task.id)}
      className="group flex w-full items-start gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-foreground/30"
    >
      <TaskCardBody task={task} assigneeMap={assigneeMap} onOpenProjectLink={onOpenProjectLink} />
    </button>
  );
}

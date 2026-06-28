"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { KanbanCard } from "@/components/tasks/kanban-card";
import { statusBadgeClass } from "@/components/tasks/task-row-parts";
import type { TaskDisplayStatus } from "@/lib/task-status";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export function KanbanColumn({
  status,
  tasks,
  assigneeMap,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  onOpenProjectLink,
  onQuickAdd,
}: {
  status: TaskDisplayStatus;
  tasks: Task[];
  assigneeMap: Map<string, string>;
  collapsed: boolean;
  onToggleCollapsed: (status: TaskDisplayStatus) => void;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
  onQuickAdd: (status: TaskDisplayStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status, type: "column" },
  });
  const taskIds = tasks.map((t) => t.id);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onToggleCollapsed(status)}
        className={cn(
          "flex h-full w-10 shrink-0 flex-col items-center justify-start gap-2 rounded-[1.25rem] border border-border/70 bg-muted/15 py-3 transition-colors hover:bg-muted/30",
          isOver && "border-primary/50 bg-primary/5"
        )}
        aria-label={`${status} 펼치기`}
        title={`${status} (${tasks.length}) 펼치기`}
      >
        <ChevronRight className="size-4 text-muted-foreground" />
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            statusBadgeClass(status)
          )}
          style={{ writingMode: "vertical-rl" }}
        >
          {status}
        </span>
        <span className="mt-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-w-[240px] flex-1 basis-0 flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-muted/15 p-3 transition-colors",
        isOver && "border-primary/50 bg-primary/5"
      )}
    >
      <button
        type="button"
        onClick={() => onToggleCollapsed(status)}
        className="flex items-center justify-between gap-2 rounded-lg px-1 text-left text-sm hover:bg-background/60"
      >
        <span className="inline-flex items-center gap-2">
          <ChevronDown className="size-4 text-muted-foreground" />
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              statusBadgeClass(status)
            )}
          >
            {status}
          </span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
      </button>

      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-background/40 p-1"
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              assigneeMap={assigneeMap}
              onNavigate={onNavigate}
              onOpenProjectLink={onOpenProjectLink}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
            비어 있음
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onQuickAdd(status)}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-background/60 hover:text-foreground"
        aria-label={`${status} 빠른 추가`}
      >
        <Plus className="size-3.5" />
        빠른 추가
      </button>
    </div>
  );
}

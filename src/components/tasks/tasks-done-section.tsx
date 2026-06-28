"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { TaskStaticCard } from "@/components/tasks/kanban-card";
import type { Task } from "@/lib/types";

export function TasksDoneSection({
  tasks,
  assigneeMap,
  onNavigate,
  onOpenProjectLink,
  label = "완료",
  defaultOpen = false,
}: {
  tasks: Task[];
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (tasks.length === 0) return null;

  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-muted/10 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
      >
        <span className="inline-flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span>{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {tasks.length}
          </span>
        </span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskStaticCard
              key={task.id}
              task={task}
              assigneeMap={assigneeMap}
              onNavigate={onNavigate}
              onOpenProjectLink={onOpenProjectLink}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

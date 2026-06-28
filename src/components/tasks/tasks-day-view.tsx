"use client";

import { useMemo } from "react";
import { CircleDashed, CirclePlay, ListChecks } from "lucide-react";

import { TaskStaticCard } from "@/components/tasks/kanban-card";
import { TasksDoneSection } from "@/components/tasks/tasks-done-section";
import { isTaskForToday, todayISO } from "@/lib/tasks/date-filter";
import { normalizeTaskStatus } from "@/lib/task-status";
import type { Task } from "@/lib/types";

export function TasksDayView({
  tasks,
  assigneeMap,
  onNavigate,
  onOpenProjectLink,
}: {
  tasks: Task[];
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
  onOpenProjectLink: (task: Task) => void;
}) {
  const today = todayISO();

  const { inProgress, toDo, done } = useMemo(() => {
    const inProgress: Task[] = [];
    const toDo: Task[] = [];
    const done: Task[] = [];

    for (const task of tasks) {
      if (!isTaskForToday(task, today)) continue;
      const status = normalizeTaskStatus(task.status);
      if (status === "진행중") inProgress.push(task);
      else if (status === "완료" || status === "취소") done.push(task);
      else toDo.push(task);
    }
    return { inProgress, toDo, done };
  }, [tasks, today]);

  const isEmpty = inProgress.length === 0 && toDo.length === 0 && done.length === 0;

  const formatted = new Date(`${today}T00:00:00`).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">오늘</span> · {formatted}
      </p>

      <section className="flex flex-col gap-3 rounded-[1.25rem] border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-500/40 dark:bg-sky-950/20">
        <header className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
          <CirclePlay className="size-4" />
          <span>진행 중</span>
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs tabular-nums text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
            {inProgress.length}
          </span>
        </header>
        {inProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">현재 진행 중인 할일이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {inProgress.map((task) => (
              <TaskStaticCard
                key={task.id}
                task={task}
                assigneeMap={assigneeMap}
                onNavigate={onNavigate}
                onOpenProjectLink={onOpenProjectLink}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
        <header className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="size-4 text-muted-foreground" />
          <span>오늘 할 일</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {toDo.length}
          </span>
        </header>
        {toDo.length === 0 ? (
          <p className="text-sm text-muted-foreground">오늘 기한의 할일이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {toDo.map((task) => (
              <TaskStaticCard
                key={task.id}
                task={task}
                assigneeMap={assigneeMap}
                onNavigate={onNavigate}
                onOpenProjectLink={onOpenProjectLink}
              />
            ))}
          </div>
        )}
      </section>

      <TasksDoneSection
        tasks={done}
        assigneeMap={assigneeMap}
        onNavigate={onNavigate}
        onOpenProjectLink={onOpenProjectLink}
        label="오늘 완료/취소"
      />

      {isEmpty ? (
        <div className="flex items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-border/60 bg-background/50 p-10 text-sm text-muted-foreground">
          <CircleDashed className="size-4" />
          오늘 노출할 할일이 없습니다.
        </div>
      ) : null}
    </div>
  );
}

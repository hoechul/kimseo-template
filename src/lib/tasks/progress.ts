import { normalizeTaskStatus } from "@/lib/task-status";
import type { Task } from "@/lib/types";

export function taskProgress(task: Task): number {
  const status = normalizeTaskStatus(task.status);
  if (status === "완료") return 1;
  if (status === "진행중") return 0.5;
  return 0;
}

export type ProjectProgress = {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  percent: number;
};

export function computeProjectProgress(tasks: Task[]): ProjectProgress {
  let done = 0;
  let inProgress = 0;
  let pending = 0;
  let cancelled = 0;

  for (const task of tasks) {
    const status = normalizeTaskStatus(task.status);
    if (status === "완료") done += 1;
    else if (status === "진행중") inProgress += 1;
    else if (status === "취소") cancelled += 1;
    else pending += 1;
  }

  const total = done + inProgress + pending;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return { total, done, inProgress, pending, cancelled, percent };
}

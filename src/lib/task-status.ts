import type { TaskStatus } from "@/lib/types";

type LegacyTaskStatus = "대기" | "보류";

export type TaskDisplayStatus = TaskStatus;
export type TaskStatusTab = "all" | TaskDisplayStatus;

export const TASK_STATUS_OPTIONS: TaskDisplayStatus[] = ["백로그", "할 일", "진행중", "완료", "취소"];
export const TASK_STATUS_TAB_VALUES: TaskStatusTab[] = ["all", "백로그", "할 일", "진행중", "완료", "취소"];

export const TASK_STATUS_TABS: Array<{ value: TaskStatusTab; label: string }> = [
  { value: "all", label: "전체" },
  { value: "백로그", label: "백로그" },
  { value: "할 일", label: "할 일" },
  { value: "진행중", label: "진행중" },
  { value: "완료", label: "완료" },
  { value: "취소", label: "취소" },
];

export type TaskWithDisplayStatus<T extends { status: TaskStatus }> = Omit<T, "status"> & {
  status: TaskDisplayStatus;
};

export function normalizeTaskStatus(status: TaskStatus | LegacyTaskStatus): TaskDisplayStatus {
  if (status === "대기") return "할 일";
  if (status === "보류") return "취소";
  return status;
}

export function normalizeTaskStatusItem<T extends { status: TaskStatus }>(
  task: T
): TaskWithDisplayStatus<T> {
  return {
    ...task,
    status: normalizeTaskStatus(task.status),
  };
}

export function normalizeTaskStatuses<T extends { status: TaskStatus }>(
  tasks: T[]
): TaskWithDisplayStatus<T>[] {
  return tasks.map((task) => normalizeTaskStatusItem(task));
}

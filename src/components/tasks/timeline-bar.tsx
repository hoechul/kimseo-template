"use client";

import { useMasking } from "@/components/masking-provider";
import { statusBadgeClass } from "@/components/tasks/task-row-parts";
import { getTaskAssigneeLabel, getTaskAssigneeNames } from "@/lib/task-assignees";
import { getTaskDateRange } from "@/lib/tasks/date-filter";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

function priorityBorderClass(priority: Task["priority"]) {
  if (priority === "높음") return "border-red-400";
  if (priority === "보통") return "border-sky-400";
  return "border-gray-300";
}

export function TimelineBar({
  task,
  weekDays,
  laneRow,
  assigneeMap,
  onNavigate,
}: {
  task: Task;
  weekDays: string[];
  laneRow: number;
  assigneeMap: Map<string, string>;
  onNavigate: (taskId: string) => void;
}) {
  const { mask } = useMasking();
  const range = getTaskDateRange(task);
  if (!range) return null;

  const weekStart = weekDays[0];
  const weekEnd = weekDays[weekDays.length - 1];

  const clampedStart = range.start < weekStart ? weekStart : range.start;
  const clampedEnd = range.end > weekEnd ? weekEnd : range.end;

  const startIndex = weekDays.indexOf(clampedStart);
  const endIndex = weekDays.indexOf(clampedEnd);
  if (startIndex === -1 || endIndex === -1) return null;

  const colStart = startIndex + 1;
  const colEnd = endIndex + 2;

  const maskedTitle = mask("title", task.title);
  const assigneeNames = getTaskAssigneeNames(task, assigneeMap);
  const maskedAssigneeLabel =
    assigneeNames.length > 0
      ? assigneeNames.map((name) => mask("name", name)).join(", ")
      : getTaskAssigneeLabel(task, assigneeMap);

  return (
    <button
      type="button"
      onClick={() => onNavigate(task.id)}
      style={{ gridColumn: `${colStart} / ${colEnd}`, gridRow: laneRow + 1 }}
      className={cn(
        "inline-flex items-center gap-2 truncate rounded-full border-2 border-l-[3px] px-3 py-1 text-left text-xs font-medium shadow-sm transition-colors hover:brightness-95",
        statusBadgeClass(task.status),
        priorityBorderClass(task.priority)
      )}
      title={`${maskedTitle} (${range.start} ~ ${range.end})`}
    >
      <span className="truncate">{maskedTitle}</span>
      <span className="shrink-0 text-[10px] opacity-75">
        {maskedAssigneeLabel}
      </span>
    </button>
  );
}

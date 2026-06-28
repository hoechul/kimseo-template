import type { Task } from "@/lib/types";

export const TASK_ASSIGNEE_SELECT =
  "id, task_id, employee_id, created_at, employees(id, name, department)";
export const TASK_WITH_ASSIGNEES_SELECT = `*, assignees:task_assignees(${TASK_ASSIGNEE_SELECT})`;
export const TASK_WITH_PROJECT_AND_ASSIGNEES_SELECT = `*, projects:project_id(id, project_number, name), assignees:task_assignees(${TASK_ASSIGNEE_SELECT})`;

type TaskAssigneeItem = NonNullable<Task["assignees"]>[number];

function getTaskAssigneeEmployeeName(
  assignee: TaskAssigneeItem,
  employeeNameMap: Map<string, string>
) {
  const employee = Array.isArray(assignee.employees)
    ? assignee.employees[0]
    : assignee.employees;

  return employee?.name ?? employeeNameMap.get(assignee.employee_id) ?? null;
}

export function normalizeTaskAssigneeIds(
  assigneeIds: Array<string | null | undefined>
) {
  return [...new Set(assigneeIds.filter((assigneeId): assigneeId is string => Boolean(assigneeId)))];
}

export function getTaskAssigneeIds(task: Pick<Task, "assigned_to" | "assignees">) {
  const ids = normalizeTaskAssigneeIds(
    (task.assignees ?? []).map((assignee) => assignee.employee_id)
  );

  if (ids.length > 0) return ids;
  return normalizeTaskAssigneeIds([task.assigned_to]);
}

export function getTaskAssigneeNames(
  task: Pick<Task, "assigned_to" | "assignees">,
  employeeNameMap: Map<string, string>
) {
  const names = [...new Set(
    (task.assignees ?? [])
      .map((assignee) => getTaskAssigneeEmployeeName(assignee, employeeNameMap))
      .filter((name): name is string => Boolean(name))
  )];

  if (names.length > 0) return names;

  const fallbackName = task.assigned_to ? employeeNameMap.get(task.assigned_to) ?? null : null;
  return fallbackName ? [fallbackName] : [];
}

export function getTaskAssigneeLabel(
  task: Pick<Task, "assigned_to" | "assignees">,
  employeeNameMap: Map<string, string>
) {
  const assigneeNames = getTaskAssigneeNames(task, employeeNameMap);
  return assigneeNames.length > 0 ? assigneeNames.join(", ") : "미지정";
}

export function buildTaskAssigneeRows(taskId: string, assigneeIds: string[]) {
  return normalizeTaskAssigneeIds(assigneeIds).map((employee_id) => ({
    task_id: taskId,
    employee_id,
  }));
}

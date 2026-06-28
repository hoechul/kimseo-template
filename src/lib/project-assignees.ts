import type { Project, ProjectAssignee } from "@/lib/types";

export function getProjectAssigneeNames(project: Pick<Project, "manager" | "assignees">) {
  const names =
    project.assignees
      ?.map((assignee) => {
        const employee = Array.isArray(assignee.employees)
          ? assignee.employees[0]
          : assignee.employees;
        return employee?.name?.trim() ?? "";
      })
      .filter(Boolean) ?? [];

  if (names.length > 0) return names;

  return (project.manager ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function attachProjectAssignees<T extends Pick<Project, "id">>(
  projects: T[],
  assignees: ProjectAssignee[]
): Array<T & { assignees: ProjectAssignee[] }> {
  const assigneeMap = new Map<string, ProjectAssignee[]>();

  for (const assignee of assignees) {
    const existing = assigneeMap.get(assignee.project_id);
    if (existing) existing.push(assignee);
    else assigneeMap.set(assignee.project_id, [assignee]);
  }

  return projects.map((project) => ({
    ...project,
    assignees: assigneeMap.get(project.id) ?? [],
  }));
}

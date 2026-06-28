import { createClient } from "@/lib/supabase/server";
import { attachProjectAssignees } from "@/lib/project-assignees";
import type { Customer, Employee, Project, ProjectType } from "@/lib/types";

import { WorkspaceShell } from "./workspace-shell";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; customerId?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentEmployeeId: string | null = null;
  if (user) {
    const { data: me } = await supabase
      .from("employees")
      .select("id")
      .eq("auth_uid", user.id)
      .maybeSingle();
    currentEmployeeId = me?.id ?? null;
  }

  const [projectRes, assigneeRes, employeeRes, customerRes, typeRes] = await Promise.all([
    supabase
      .from("projects")
      .select("*, customers(id, name, business_number, drive_folder_id), project_types(id, name)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("project_assignees")
      .select("id, project_id, employee_id, created_at, employees(id, name, department)")
      .limit(2000),
    supabase.from("employees").select("*").order("name").limit(500),
    supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("project_types").select("*").order("sort_order", { ascending: true }).limit(500),
  ]);

  const allProjects = attachProjectAssignees(
    (projectRes.data ?? []) as Project[],
    assigneeRes.data ?? []
  );

  const projects = currentEmployeeId
    ? allProjects.filter((p) => {
        if (p.manager === currentEmployeeId) return true;
        return (p.assignees ?? []).some((a) => a.employee_id === currentEmployeeId);
      })
    : allProjects;

  const employees = (employeeRes.data ?? []) as Employee[];
  const customers = (customerRes.data ?? []) as Customer[];
  const projectTypes = (typeRes.data ?? []) as ProjectType[];

  const initialCustomerId = params.customerId ?? null;
  const initialProjectId = initialCustomerId
    ? null
    : params.projectId ??
      projects.find((p) => p.status === "진행중")?.id ??
      projects[0]?.id ??
      null;

  return (
    <WorkspaceShell
      projects={projects}
      employees={employees}
      customers={customers}
      projectTypes={projectTypes}
      initialProjectId={initialProjectId}
      initialCustomerId={initialCustomerId}
      initialTab={params.tab ?? "overview"}
    />
  );
}

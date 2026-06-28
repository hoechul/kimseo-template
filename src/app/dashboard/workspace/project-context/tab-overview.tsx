"use client";

import { Building2, Calendar, FolderKanban, User } from "lucide-react";

import { getProjectAssigneeNames } from "@/lib/project-assignees";
import { useMasking } from "@/components/masking-provider";
import { formatKstDateLabel } from "@/lib/date";
import type { Project } from "@/lib/types";

interface TabOverviewProps {
  project: Project;
  onSelectCustomer: (customerId: string) => void;
}

function formatDateRange(start: string | null, end: string | null) {
  const left = start ? formatKstDateLabel(start) : "—";
  const right = end ? formatKstDateLabel(end) : "—";
  return `${left} ~ ${right}`;
}

export function TabOverview({ project, onSelectCustomer }: TabOverviewProps) {
  const { mask } = useMasking();
  const assigneeNames = getProjectAssigneeNames(project);
  const assigneeLabel =
    assigneeNames.length > 0 ? assigneeNames.map((n) => mask("name", n)).join(", ") : "미지정";

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field icon={<User className="h-3.5 w-3.5" />} label="고객">
          {project.customers ? (
            <button
              type="button"
              onClick={() => {
                if (project.customers) onSelectCustomer(project.customers.id);
              }}
              className="inline-flex min-w-0 max-w-full items-center gap-1.5 hover:underline"
            >
              <span className="truncate">{mask("customer_name", project.customers.name)}</span>
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            "—"
          )}
        </Field>
        <Field icon={<FolderKanban className="h-3.5 w-3.5" />} label="유형">
          {project.project_types?.name ?? "—"}
        </Field>
        <Field icon={<User className="h-3.5 w-3.5" />} label="담당자">
          {assigneeLabel}
        </Field>
        <Field icon={<Calendar className="h-3.5 w-3.5" />} label="기간">
          {formatDateRange(project.start_date, project.end_date)}
        </Field>
      </div>

      {project.description ? (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">설명</div>
          <div className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-foreground">
            {project.description}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

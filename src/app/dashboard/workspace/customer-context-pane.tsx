"use client";

import { Building2, FolderKanban, Mail, Phone, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import { getProjectAssigneeNames } from "@/lib/project-assignees";
import type { Customer, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CustomerContextPaneProps {
  customer: Customer | null;
  projects: Project[];
  selectedCustomerId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateCustomer: () => void;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  진행예정: "outline",
  진행중: "default",
  완료: "secondary",
  보류: "outline",
  취소: "destructive",
};

export function CustomerContextPane({
  customer,
  projects,
  selectedCustomerId,
  onSelectProject,
  onCreateCustomer,
}: CustomerContextPaneProps) {
  const { mask } = useMasking();
  if (!customer && selectedCustomerId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        고객 정보를 불러오는 중입니다
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <div>왼쪽에서 고객이나 프로젝트를 선택하세요</div>
        <Button type="button" size="sm" variant="outline" onClick={onCreateCustomer}>
          고객 추가
        </Button>
      </div>
    );
  }

  const linkedProjects = projects.filter((project) => project.customer_id === customer.id);
  const activeProjects = linkedProjects.filter((project) =>
    ["진행예정", "진행중", "보류"].includes(project.status)
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold text-foreground">{mask("customer_name", customer.name)}</h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{customer.customer_type ?? "구분 없음"}</span>
            <span>·</span>
            <span>프로젝트 {linkedProjects.length}건</span>
            {activeProjects.length > 0 ? (
              <>
                <span>·</span>
                <span>진행/예정 {activeProjects.length}건</span>
              </>
            ) : null}
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onCreateCustomer}>
          고객 추가
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Section title="기본 정보">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field icon={<UserRound className="h-3.5 w-3.5" />} label="대표자">
              {customer.representative_name ? mask("name", customer.representative_name) : "-"}
            </Field>
            <Field icon={<Building2 className="h-3.5 w-3.5" />} label="사업자번호">
              {customer.business_number
                ? mask("business_number", customer.business_number)
                : customer.resident_number
                  ? mask("business_number", customer.resident_number)
                  : "-"}
            </Field>
            <Field icon={<UserRound className="h-3.5 w-3.5" />} label="담당자">
              {customer.contact_name ? mask("name", customer.contact_name) : "-"}
            </Field>
            <Field icon={<Phone className="h-3.5 w-3.5" />} label="연락처">
              {customer.contact_phone ? mask("phone", customer.contact_phone) : "-"}
            </Field>
            <Field icon={<Mail className="h-3.5 w-3.5" />} label="이메일">
              {customer.contact_email ? (
                <a href={`mailto:${customer.contact_email}`} className="hover:underline">
                  {mask("email", customer.contact_email)}
                </a>
              ) : (
                "-"
              )}
            </Field>
            <Field icon={<Building2 className="h-3.5 w-3.5" />} label="주소">
              {customer.address ? mask("address", customer.address) : "-"}
            </Field>
          </div>
        </Section>

        {customer.memo ? (
          <Section title="메모">
            <div className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-foreground">
              {customer.memo}
            </div>
          </Section>
        ) : null}

        <Section title={`연결 프로젝트 ${linkedProjects.length}`}>
          {linkedProjects.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
              연결된 프로젝트가 없습니다
            </div>
          ) : (
            <div className="space-y-1.5">
              {linkedProjects.map((project) => {
                const assignees = getProjectAssigneeNames(project);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={cn(
                      "block w-full rounded-md border border-border/60 bg-background/80 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium text-foreground">
                            {mask("title", project.name)}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {project.project_number || "번호 없음"}
                          {project.project_types?.name ? ` · ${project.project_types.name}` : ""}
                          {assignees.length > 0
                            ? ` · ${assignees.map((n) => mask("name", n)).join(", ")}`
                            : ""}
                        </div>
                      </div>
                      <Badge variant={statusVariant[project.status] ?? "outline"}>
                        {project.status}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border/60 px-4 py-3 last:border-b-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 truncate text-sm text-foreground">{children}</div>
    </div>
  );
}

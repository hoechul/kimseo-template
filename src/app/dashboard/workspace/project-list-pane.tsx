"use client";

import { Building2, FolderKanban, Plus, Search, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DRIVE_ENABLED } from "@/lib/drive-config";

import { ProjectDialog } from "@/components/project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMasking } from "@/components/masking-provider";
import { sendLog } from "@/lib/log-client";
import { PROJECT_STATUS_TABS, type ProjectStatusTab } from "@/lib/project-status";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  Customer,
  Employee,
  Project,
  ProjectInsert,
  ProjectType,
} from "@/lib/types";

interface ProjectListPaneProps {
  projects: Project[];
  customers: Customer[];
  employees: Employee[];
  projectTypes: ProjectType[];
  selectedProjectId: string | null;
  selectedCustomerId: string | null;
  onSelect: (projectId: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onProjectCreated: (projectId: string | null) => void;
  onCreateCustomer: () => void;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "진행중":
      return "bg-sky-100 text-sky-700";
    case "완료":
      return "bg-emerald-100 text-emerald-700";
    case "진행예정":
      return "bg-amber-100 text-amber-700";
    case "보류":
      return "bg-violet-100 text-violet-700";
    case "취소":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function compactCustomerMeta(
  customer: Customer,
  mask: (category: import("@/lib/masking").MaskCategory, value: string) => string
) {
  return [
    customer.representative_name ? `대표 ${mask("name", customer.representative_name)}` : null,
    customer.contact_name ? `담당 ${mask("name", customer.contact_name)}` : null,
    customer.business_number ? mask("business_number", customer.business_number) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function customerSearchText(customer: Customer) {
  return [
    customer.name,
    customer.representative_name,
    customer.business_number,
    customer.contact_name,
    customer.contact_email,
    customer.contact_phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function generateProjectNumber(supabase: ReturnType<typeof createClient>) {
  const yy = String(new Date().getFullYear()).slice(2);
  const prefix = `${yy}-`;
  const { data } = await supabase
    .from("projects")
    .select("project_number")
    .like("project_number", `${prefix}%`)
    .order("project_number", { ascending: false });
  let seq = 1;
  if (data && data.length > 0) {
    const maxSeq = data.reduce((max, row) => {
      const number = parseInt(row.project_number.split("-")[1], 10);
      return Number.isNaN(number) ? max : Math.max(max, number);
    }, 0);
    seq = maxSeq + 1;
  }
  return `${prefix}${seq}`;
}

export function ProjectListPane({
  projects,
  customers,
  employees,
  projectTypes,
  selectedProjectId,
  selectedCustomerId,
  onSelect,
  onSelectCustomer,
  onProjectCreated,
  onCreateCustomer,
}: ProjectListPaneProps) {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<ProjectStatusTab>("진행중");
  const [dialogOpen, setDialogOpen] = useState(false);

  const term = search.trim().toLowerCase();
  const isSearching = term.length > 0;

  const customerById = useMemo(() => {
    return new Map(customers.map((customer) => [customer.id, customer]));
  }, [customers]);

  const projectsByCustomerId = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const project of projects) {
      if (!project.customer_id) continue;
      const items = map.get(project.customer_id) ?? [];
      items.push(project);
      map.set(project.customer_id, items);
    }
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (statusTab !== "전체" && p.status !== statusTab) return false;
      if (term) {
        const customer = p.customer_id ? customerById.get(p.customer_id) : null;
        const haystack = [
          p.name,
          p.project_number,
          p.client,
          p.status,
          p.customers?.name,
          customer?.representative_name,
          customer?.business_number,
          customer?.contact_name,
          customer?.contact_email,
          customer?.contact_phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [customerById, projects, statusTab, term]);

  const customerHits = useMemo(() => {
    if (!term) return [];
    return customers
      .filter((customer) => customerSearchText(customer).includes(term))
      .map((customer) => {
        const linkedProjects = projectsByCustomerId.get(customer.id) ?? [];
        const visibleProjects =
          statusTab === "전체"
            ? linkedProjects
            : linkedProjects.filter((project) => project.status === statusTab);
        return { customer, linkedProjects, visibleProjects };
      });
  }, [customers, projectsByCustomerId, statusTab, term]);

  const customerProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const hit of customerHits) {
      for (const project of hit.visibleProjects) ids.add(project.id);
    }
    return ids;
  }, [customerHits]);

  const projectHits = useMemo(() => {
    if (!isSearching) return filtered;
    if (customerProjectIds.size === 0) return filtered;
    return filtered.filter((project) => !customerProjectIds.has(project.id));
  }, [customerProjectIds, filtered, isSearching]);

  const handleSave = async (data: ProjectInsert, assigneeIds: string[]) => {
    const selectedCustomer = customers.find((c) => c.id === data.customer_id);
    const cleaned = {
      ...data,
      customer_id: data.customer_id || null,
      type_id: data.type_id || null,
      client: selectedCustomer?.name || data.client || null,
      description: data.description || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
    };

    const projectNumber = await generateProjectNumber(supabase);

    let driveFolderId: string | null = null;
    if (DRIVE_ENABLED) try {
      let parentId: string | undefined;
      if (cleaned.type_id) {
        const typeFolderRes = await fetch("/api/drive/type-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typeId: cleaned.type_id }),
        });
        if (!typeFolderRes.ok) {
          const errData = await typeFolderRes.json().catch(() => null);
          throw new Error(`유형 폴더 조회 실패: ${errData?.error ?? typeFolderRes.status}`);
        }
        const typeFolderData = await typeFolderRes.json();
        if (!typeFolderData?.driveFolderId) {
          throw new Error("유형 폴더 ID를 받지 못했습니다.");
        }
        parentId = typeFolderData.driveFolderId;
      }
      if (!parentId) {
        throw new Error("상위 폴더를 결정하지 못했습니다.");
      }

      const folderRes = await fetch("/api/drive/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${projectNumber} ${cleaned.name}`, parentId }),
      });
      if (folderRes.ok) {
        const folder = await folderRes.json();
        driveFolderId = folder.id;
      } else {
        toast.error("Drive 폴더를 만들지 못했습니다.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Drive 폴더 생성 실패: ${message}`);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("projects")
      .insert({ ...cleaned, project_number: projectNumber, drive_folder_id: driveFolderId })
      .select("id")
      .single();

    if (insertError || !inserted) {
      toast.error("프로젝트 등록에 실패했습니다.");
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: assigneeError } = await supabase.from("project_assignees").insert(
        assigneeIds.map((employee_id) => ({ project_id: inserted.id, employee_id }))
      );
      if (assigneeError) {
        toast.error("담당자 연결에 실패했습니다.");
        onProjectCreated(inserted.id);
        return;
      }
    }

    try {
      await fetch("/api/integrations/slack/project-created", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_number: projectNumber,
          project_name: data.name,
          customer_name: selectedCustomer?.name ?? cleaned.client,
          status: cleaned.status,
          project_url: `${window.location.origin}/dashboard/projects/${inserted.id}`,
        }),
      });
    } catch {
      toast.warning("프로젝트는 등록되었지만 Slack 알림 발송은 실패했습니다.");
    }

    sendLog("CREATE_PROJECT", `프로젝트 등록: ${data.name}`, { resource: "project" });
    toast.success("프로젝트가 등록되었습니다.");
    onProjectCreated(inserted.id);
  };

  const renderProjectRow = (p: Project, compact = false) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onSelect(p.id)}
      className={cn(
        "block w-full text-left transition-colors hover:bg-accent",
        compact
          ? "rounded-md border border-border/50 px-2 py-1.5"
          : "border-b border-border/40 px-3 py-2.5",
        selectedProjectId === p.id && "bg-primary/10"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate font-medium text-foreground",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {mask("title", p.name)}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {p.project_number ? `${p.project_number} · ` : ""}
            {p.customers?.name
              ? mask("customer_name", p.customers.name)
              : p.client
                ? mask("customer_name", p.client)
                : "고객 미지정"}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
            statusBadgeClass(p.status)
          )}
        >
          {p.status}
        </span>
      </div>
    </button>
  );

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-background/40">
      <div className="space-y-2 border-b border-border/60 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="프로젝트·고객 검색"
              className="h-8 pl-8 pr-8 text-sm"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="검색 초기화"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-2"
            onClick={() => setDialogOpen(true)}
            title="프로젝트 추가"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 px-2"
            onClick={onCreateCustomer}
            title="고객 추가"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="-mx-1 flex flex-wrap gap-1 px-1">
          {PROJECT_STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusTab(tab)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs transition-colors",
                statusTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          {isSearching
            ? `프로젝트 ${projectHits.length}개 · 고객 ${customerHits.length}곳`
            : `${projectHits.length}개`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isSearching && customerHits.length > 0 ? (
          <div className="border-b border-border/60">
            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              고객
            </div>
            {customerHits.map(({ customer, linkedProjects, visibleProjects }) => {
              const meta = compactCustomerMeta(customer, mask);
              const hiddenProjectCount = Math.max(visibleProjects.length - 3, 0);
              return (
                <div
                  key={customer.id}
                  className={cn(
                    "border-t border-border/40 px-3 py-2.5",
                    selectedCustomerId === customer.id && "bg-primary/10"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectCustomer(customer.id)}
                    className="block w-full rounded-sm text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium text-foreground">
                        {mask("customer_name", customer.name)}
                      </span>
                    </div>
                    {meta ? (
                      <div className="mt-0.5 truncate pl-5 text-xs text-muted-foreground">
                        {meta}
                      </div>
                    ) : null}
                  </button>

                  <div className="mt-2 space-y-1">
                    {visibleProjects.length > 0 ? (
                      <>
                        {visibleProjects
                          .slice(0, 3)
                          .map((project) => renderProjectRow(project, true))}
                        {hiddenProjectCount > 0 ? (
                          <div className="px-2 pt-0.5 text-[11px] text-muted-foreground">
                            외 {hiddenProjectCount}건
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground">
                        <FolderKanban className="h-3.5 w-3.5" />
                        {linkedProjects.length > 0
                          ? `${statusTab} 프로젝트 없음`
                          : "연결 프로젝트 없음"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {projectHits.length === 0 && customerHits.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">결과 없음</div>
        ) : projectHits.length > 0 ? (
          <>
            {isSearching ? (
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                프로젝트
              </div>
            ) : null}
            {projectHits.map((p) => renderProjectRow(p))}
          </>
        ) : null}
      </div>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={null}
        customers={customers}
        employees={employees}
        projectTypes={projectTypes}
        onSave={handleSave}
      />
    </div>
  );
}

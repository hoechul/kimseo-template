"use client";

import Link from "next/link";
import { FolderKanban, PlayCircle, Plus, Search, UsersRound, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DRIVE_ENABLED } from "@/lib/drive-config";

import { EmployeeFilter, type FilterMode } from "@/components/calendar/employee-filter";
import { ErrorState, LoadingState, PageHeader, PageShell, PageToolbar, StatCard, StatsGrid } from "@/components/page-shell";
import { ProjectDialog } from "@/components/project-dialog";
import { ProjectTable } from "@/components/project-table";
import { ProjectBulkActionBar } from "@/components/projects/project-bulk-action-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sendLog } from "@/lib/log-client";
import { attachProjectAssignees, getProjectAssigneeNames } from "@/lib/project-assignees";
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_STATUS_TABS,
  projectStatusButtonClass,
  type ProjectStatus,
} from "@/lib/project-status";
import { bulkUpdateProjects, type BulkProjectPatch } from "@/lib/project-mutations";
import { createClient } from "@/lib/supabase/client";
import { usePersistedTab } from "@/lib/use-persisted-tab";
import { cn, formatAmountInMan } from "@/lib/utils";
import type { DragSelectMode } from "@/lib/use-drag-select";
import type { Customer, Employee, Project, ProjectInsert, ProjectType } from "@/lib/types";

export default function ProjectsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [projectTypesReady, setProjectTypesReady] = useState(false);
  const [revenueTotals, setRevenueTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<Set<ProjectStatus>>(() => new Set());
  const [statusFiltersReady, setStatusFiltersReady] = useState(false);
  const typeTabs = useMemo(() => ["전체", ...projectTypes.map((type) => type.name)], [projectTypes]);
  const [selectedType, setSelectedType] = usePersistedTab<string>(
    "dashboard.projects.type-tab",
    "전체",
    typeTabs,
    projectTypesReady
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [statusModalProject, setStatusModalProject] = useState<Project | null>(null);
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const [projectRes, revenueRes, assigneeRes, customersRes, employeesRes, typesRes] = await Promise.all([
      supabase
        .from("projects")
        .select("*, customers(id, name, business_number), project_types(id, name)")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("revenues").select("project_id, total_amount").limit(1000),
      supabase
        .from("project_assignees")
        .select("id, project_id, employee_id, created_at, employees(id, name, department)")
        .limit(1000),
      supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("employees").select("*").order("name").limit(500),
      supabase.from("project_types").select("*").order("sort_order", { ascending: true }).limit(500),
    ]);

    if (projectRes.error) {
      console.error("프로젝트 목록 조회 실패:", projectRes.error.message);
      toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setError(true);
      setLoading(false);
      return;
    }

    if (assigneeRes.error) {
      console.error("담당자 정보 조회 실패:", assigneeRes.error.message);
      toast.error("담당자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    setProjects(attachProjectAssignees(projectRes.data ?? [], assigneeRes.data ?? []));

    const totals: Record<string, number> = {};
    for (const revenue of revenueRes.data ?? []) {
      if (revenue.project_id) {
        totals[revenue.project_id] = (totals[revenue.project_id] ?? 0) + revenue.total_amount;
      }
    }
    setRevenueTotals(totals);

    if (customersRes.error) {
      console.error("고객 목록 조회 실패:", customersRes.error.message);
    }
    setCustomers(customersRes.data ?? []);

    if (employeesRes.error) {
      console.error("직원 목록 조회 실패:", employeesRes.error.message);
    }
    const nextEmployees = employeesRes.data ?? [];
    setEmployees(nextEmployees);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedEmployeeIds((prev) => (prev.length > 0 ? prev : nextEmployees.map((employee) => employee.id)));

    if (typesRes.error) {
      console.error("프로젝트 유형 조회 실패:", typesRes.error.message);
    }
    setProjectTypes(typesRes.data ?? []);
    setProjectTypesReady(true);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dashboard.projects.status-filters");
      if (raw) {
        const parsed = raw
          .split(",")
          .map((item) => item.trim())
          .filter((item): item is ProjectStatus =>
            (PROJECT_STATUS_OPTIONS as readonly string[]).includes(item)
          );
        if (parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setStatusFilters(new Set(parsed));
        }
      }
    } catch {
      // ignore
    }
    setStatusFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!statusFiltersReady) return;
    try {
      window.localStorage.setItem(
        "dashboard.projects.status-filters",
        Array.from(statusFilters).join(",")
      );
    } catch {
      // ignore
    }
  }, [statusFilters, statusFiltersReady]);

  const toggleStatusFilter = useCallback((status: ProjectStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const clearStatusFilters = useCallback(() => {
    setStatusFilters(new Set());
  }, []);

  const toggleProjectSelection = useCallback((id: string, checked: boolean) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllVisibleProjects = useCallback((visibleIds: string[], checked: boolean) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      return next;
    });
  }, []);

  const clearProjectSelection = useCallback(() => {
    setSelectedProjectIds(new Set());
  }, []);

  const projectsRef = useRef<Project[]>(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const runBulkProjectUpdate = useCallback(
    async (
      ids: string[],
      patch: BulkProjectPatch,
      successMessage: (count: number) => string,
      options: { clearSelectionOnSuccess?: boolean; singleId?: string } = {}
    ) => {
      if (ids.length === 0) return;

      if (options.singleId) setUpdatingProjectId(options.singleId);
      else setBulkPending(true);

      const prevProjects = projectsRef.current;
      const idSet = new Set(ids);
      setProjects((prev) =>
        prev.map((project) =>
          idSet.has(project.id) ? { ...project, ...patch } : project
        )
      );

      const result = await bulkUpdateProjects(supabase, ids, patch);
      if (!result.ok) {
        console.error("프로젝트 일괄 수정 실패:", result.error);
        toast.error("프로젝트 일괄 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setProjects(prevProjects);
        if (options.singleId) setUpdatingProjectId(null);
        else setBulkPending(false);
        return;
      }

      toast.success(successMessage(ids.length));
      if (options.clearSelectionOnSuccess) setSelectedProjectIds(new Set());
      if (options.singleId) setUpdatingProjectId(null);
      else setBulkPending(false);
    },
    [supabase]
  );

  const handleBulkStatus = useCallback(
    (nextStatus: ProjectStatus) =>
      runBulkProjectUpdate(
        Array.from(selectedProjectIds),
        { status: nextStatus },
        (n) => `${n}건 상태를 ${nextStatus}(으)로 변경했습니다.`,
        { clearSelectionOnSuccess: true }
      ),
    [runBulkProjectUpdate, selectedProjectIds]
  );

  const handleStatusModalSelect = useCallback(
    async (nextStatus: ProjectStatus) => {
      const project = statusModalProject;
      if (!project) return;
      setStatusModalProject(null);
      await runBulkProjectUpdate(
        [project.id],
        { status: nextStatus },
        () => `상태를 ${nextStatus}(으)로 변경했습니다.`,
        { singleId: project.id }
      );
    },
    [runBulkProjectUpdate, statusModalProject]
  );

  const handleDragSelectCommit = useCallback((ids: string[], mode: DragSelectMode) => {
    if (ids.length === 0) return;
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (mode === "add") {
        for (const id of ids) next.add(id);
      } else {
        for (const id of ids) next.delete(id);
      }
      return next;
    });
  }, []);

  const generateProjectNumber = async () => {
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
  };

  const handleSave = async (data: ProjectInsert, assigneeIds: string[]) => {
    const selectedCustomer = customers.find((customer) => customer.id === data.customer_id);
    const cleaned = {
      ...data,
      customer_id: data.customer_id || null,
      type_id: data.type_id || null,
      client: selectedCustomer?.name || data.client || null,
      description: data.description || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
    };
    const projectNumber = await generateProjectNumber();

    let driveFolderId: string | null = null;
    if (DRIVE_ENABLED) try {
      // 유형별 폴더를 parent로 사용. type_id가 있으면 유형 폴더 해석이 반드시 성공해야 한다.
      // 실패 시 조용히 루트(_프로젝트)로 fallback 되던 버그 때문에 과거 일부 프로젝트가 루트에 생성됐음.
      let parentId: string | undefined;
      if (cleaned.type_id) {
        const typeFolderRes = await fetch("/api/drive/type-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typeId: cleaned.type_id }),
        });
        if (!typeFolderRes.ok) {
          const errData = await typeFolderRes.json().catch(() => null);
          throw new Error(
            `유형 폴더 조회 실패 (${typeFolderRes.status}): ${errData?.error ?? "알 수 없는 오류"}`
          );
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
        toast.error("Drive 폴더를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Drive 폴더 생성 중 오류:", message);
      toast.error(`Drive 폴더 생성 실패: ${message}`);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("projects")
      .insert({
        ...cleaned,
        project_number: projectNumber,
        drive_folder_id: driveFolderId,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("프로젝트 등록 실패:", insertError?.message ?? "알 수 없는 오류");
      toast.error("프로젝트 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      await fetchAll();
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: assigneeError } = await supabase.from("project_assignees").insert(
        assigneeIds.map((employee_id) => ({
          project_id: inserted.id,
          employee_id,
        }))
      );

      if (assigneeError) {
        console.error("담당자 연결 실패:", assigneeError.message);
        toast.error("담당자 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
        await fetchAll();
        return;
      }
    }

    try {
      const slackRes = await fetch("/api/integrations/slack/project-created", {
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

      if (!slackRes.ok) {
        const slackData = await slackRes.json().catch(() => null);
        toast.warning(
          "프로젝트는 등록되었지만 Slack 알림 발송은 실패했습니다." +
            (slackData?.error ? ` ${slackData.error}` : "")
        );
      }
    } catch {
      toast.warning("프로젝트는 등록되었지만 Slack 알림 발송은 실패했습니다.");
    }

    sendLog("CREATE_PROJECT", `프로젝트 등록: ${data.name}`, { resource: "project" });
    await fetchAll();
  };

  const handleFilterChange = (mode: FilterMode, ids: string[]) => {
    setFilterMode(mode);
    setSelectedEmployeeIds(ids);
  };

  // 필터 체인: projects → (유형) → (상태) → (담당자)
  // 유형·상태 필터 적용 후 담당자 건수를 계산해야 숫자가 연동됨

  const typeFilteredProjects = useMemo(() => {
    if (selectedType === "전체") return projects;
    return projects.filter((project) => project.project_types?.name === selectedType);
  }, [projects, selectedType]);

  const statusFilteredProjects = useMemo(() => {
    if (statusFilters.size === 0) return typeFilteredProjects;
    return typeFilteredProjects.filter((project) =>
      statusFilters.has(project.status as ProjectStatus)
    );
  }, [statusFilters, typeFilteredProjects]);

  const employeeProjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const project of statusFilteredProjects) {
      for (const assignee of project.assignees ?? []) {
        counts[assignee.employee_id] = (counts[assignee.employee_id] ?? 0) + 1;
      }
    }

    return counts;
  }, [statusFilteredProjects]);

  const unassignedCount = useMemo(
    () => statusFilteredProjects.filter((project) => !project.assignees || project.assignees.length === 0).length,
    [statusFilteredProjects]
  );

  const assigneeFilteredProjects = useMemo(() => {
    if (filterMode === "all") return statusFilteredProjects;
    if (filterMode === "unassigned") {
      return statusFilteredProjects.filter((project) => !project.assignees || project.assignees.length === 0);
    }

    return statusFilteredProjects.filter((project) =>
      project.assignees?.some((assignee) => selectedEmployeeIds.includes(assignee.employee_id))
    );
  }, [filterMode, statusFilteredProjects, selectedEmployeeIds]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { "전체": projects.length };

    for (const type of projectTypes) {
      counts[type.name] = 0;
    }

    for (const project of projects) {
      const typeName = project.project_types?.name;
      if (!typeName) continue;
      counts[typeName] = (counts[typeName] ?? 0) + 1;
    }

    return counts;
  }, [projects, projectTypes]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      전체: 0,
      진행예정: 0,
      진행중: 0,
      완료: 0,
      보류: 0,
      취소: 0,
    };

    for (const project of typeFilteredProjects) {
      if (project.status in counts) {
        counts[project.status] += 1;
      }
    }

    counts["전체"] = typeFilteredProjects.length;
    return counts;
  }, [typeFilteredProjects]);

  const filtered = assigneeFilteredProjects.filter((project) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;

    const lc = (v?: string | null) => (v ?? "").toLowerCase();
    const assigneeLabel = getProjectAssigneeNames(project).join(", ");
    return (
      lc(project.project_number).includes(keyword) ||
      lc(project.name).includes(keyword) ||
      lc(project.customers?.name).includes(keyword) ||
      lc(project.client).includes(keyword) ||
      lc(project.project_types?.name).includes(keyword) ||
      lc(project.status).includes(keyword) ||
      lc(assigneeLabel).includes(keyword)
    );
  });

  const totalRevenue = Object.values(revenueTotals).reduce((sum, value) => sum + value, 0);

  return (
    <PageShell>
      <PageHeader
        title="프로젝트 관리"
        funKey="projects"
        description="고객, 담당자, 매출 흐름이 연결된 프로젝트를 상태별로 정리합니다."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/schedules">일정관리</Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              프로젝트 추가
            </Button>
          </>
        }
      />

      <StatsGrid>
        <StatCard label="전체 프로젝트" value={`${projects.length}건`} description="현재 등록된 전체 프로젝트" icon={FolderKanban} />
        <StatCard label="진행중" value={`${statusCounts["진행중"]}건`} description="실행 단계에 있는 프로젝트" icon={PlayCircle} tone="info" />
        <StatCard label="담당자 미배정" value={`${unassignedCount}건`} description="담당자 연결이 필요한 프로젝트" icon={UsersRound} tone="warning" />
        <StatCard label="누적 매출" value={`${totalRevenue.toLocaleString("ko-KR")}원`} mobileValue={formatAmountInMan(totalRevenue)} description="연결된 프로젝트 전체 매출" icon={Wallet} tone="success" sensitive="amount" />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="프로젝트명, 고객, 상태, 담당자로 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-10"
              />
            </div>
            {search ? (
              <Button variant="ghost" onClick={() => setSearch("")}>
                검색 초기화
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <div className="inline-flex min-w-full gap-2 rounded-[1.5rem] border border-border/70 bg-background/70 p-1">
              {typeTabs.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    "inline-flex min-w-fit items-center gap-2 rounded-[1.15rem] px-4 py-2 text-sm font-medium transition-all",
                    selectedType === type
                      ? "bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(13,105,106,0.72)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <span>{type}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs tabular-nums",
                      selectedType === type
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {typeCounts[type] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="inline-flex min-w-full gap-2 rounded-[1.5rem] border border-border/70 bg-background/70 p-1">
              {PROJECT_STATUS_TABS.map((status) => {
                const isAll = status === "전체";
                const isActive = isAll
                  ? statusFilters.size === 0
                  : statusFilters.has(status as ProjectStatus);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      isAll
                        ? clearStatusFilters()
                        : toggleStatusFilter(status as ProjectStatus)
                    }
                    className={cn(
                      "inline-flex min-w-fit items-center gap-2 rounded-[1.15rem] px-4 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(13,105,106,0.72)]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span>{status}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs tabular-nums",
                        isActive
                          ? "bg-primary-foreground/15 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {statusCounts[status]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <EmployeeFilter
            employees={employees}
            filterMode={filterMode}
            selectedEmployeeIds={selectedEmployeeIds}
            schedulesCount={projects.length}
            unassignedCount={unassignedCount}
            employeeScheduleCounts={employeeProjectCounts}
            onFilterChange={handleFilterChange}
          />
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState label="프로젝트 목록을 불러오는 중..." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchAll()} />
      ) : (
        <ProjectTable
          projects={filtered}
          revenueTotals={revenueTotals}
          selectedIds={selectedProjectIds}
          onToggleProject={toggleProjectSelection}
          onToggleAllVisible={toggleAllVisibleProjects}
          onCommitDragSelect={handleDragSelectCommit}
          onOpenStatusModal={setStatusModalProject}
          updatingProjectId={updatingProjectId}
        />
      )}

      <ProjectBulkActionBar
        selectedCount={selectedProjectIds.size}
        hiddenSelectedCount={Math.max(
          0,
          selectedProjectIds.size -
            filtered.reduce((count, project) => (selectedProjectIds.has(project.id) ? count + 1 : count), 0)
        )}
        pending={bulkPending}
        onBulkStatus={handleBulkStatus}
        onClear={clearProjectSelection}
      />

      <Dialog
        open={Boolean(statusModalProject)}
        onOpenChange={(open) => {
          if (!open) setStatusModalProject(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>상태 변경</DialogTitle>
            <DialogDescription>{statusModalProject?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {PROJECT_STATUS_OPTIONS.map((status) => {
              const isCurrent = statusModalProject?.status === status;
              const isUpdating = Boolean(
                statusModalProject && updatingProjectId === statusModalProject.id
              );
              return (
                <Button
                  key={status}
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-auto justify-start rounded-xl border px-4 py-3 text-left font-medium",
                    projectStatusButtonClass(status),
                    isCurrent && "ring-2 ring-primary/20",
                    isUpdating && "cursor-not-allowed opacity-60"
                  )}
                  onClick={() => void handleStatusModalSelect(status)}
                  disabled={!statusModalProject || isUpdating}
                >
                  <Badge variant="outline" className="mr-2 border-transparent bg-transparent">
                    {status}
                  </Badge>
                  {isCurrent ? "현재 상태" : "이 상태로 변경"}
                </Button>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusModalProject(null)}>
              취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={null}
        customers={customers}
        employees={employees}
        projectTypes={projectTypes}
        onSave={handleSave}
      />
    </PageShell>
  );
}

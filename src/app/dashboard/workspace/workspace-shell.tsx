"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ProjectDialog } from "@/components/project-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  Customer,
  Employee,
  Project,
  ProjectInsert,
  ProjectType,
} from "@/lib/types";

import { CommandPalette } from "./command-palette";
import { CustomerContextPane } from "./customer-context-pane";
import { CustomerCreateDialog } from "./customer-create-dialog";
import { ProjectListPane } from "./project-list-pane";
import { ProjectContextPane } from "./project-context/project-context-pane";
import { TodayPane } from "./today-pane";

interface WorkspaceShellProps {
  projects: Project[];
  employees: Employee[];
  customers: Customer[];
  projectTypes: ProjectType[];
  initialProjectId: string | null;
  initialCustomerId: string | null;
  initialTab: string;
}

type MobileView = "list" | "detail" | "today";

const LAYOUT_STORAGE_KEY = "workspace.layout.v1";

interface SavedLayout {
  list: number;
  context: number;
  today: number;
}

export function WorkspaceShell({
  projects,
  employees,
  customers,
  projectTypes,
  initialProjectId,
  initialCustomerId,
  initialTab,
}: WorkspaceShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialCustomerId ? null : initialProjectId
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialCustomerId);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [currentEmployeeName, setCurrentEmployeeName] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>(
    initialProjectId || initialCustomerId ? "detail" : "list"
  );
  const [layoutReady, setLayoutReady] = useState(false);
  const [savedLayout, setSavedLayout] = useState<SavedLayout | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          typeof parsed?.list === "number" &&
          typeof parsed?.context === "number" &&
          typeof parsed?.today === "number"
        ) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSavedLayout(parsed);
        }
      }
    } catch {
      // ignore
    }
    setLayoutReady(true);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      void supabase
        .from("employees")
        .select("id, name")
        .eq("auth_uid", user.id)
        .single()
        .then(({ data: employee }) => {
          if (employee) {
            setCurrentEmployeeId(employee.id);
            setCurrentEmployeeName(employee.name);
          }
        });
    });
  }, [supabase]);

  const updateUrl = useCallback(
    (next: { projectId?: string | null; customerId?: string | null; tab?: string | null }) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next.projectId !== undefined) {
        if (next.projectId) params.set("projectId", next.projectId);
        else params.delete("projectId");
      }
      if (next.customerId !== undefined) {
        if (next.customerId) params.set("customerId", next.customerId);
        else params.delete("customerId");
      }
      if (next.tab !== undefined) {
        if (next.tab) params.set("tab", next.tab);
        else params.delete("tab");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (selectedCustomerId && !searchParams?.get("customerId")) {
      updateUrl({ customerId: selectedCustomerId, projectId: null, tab: null });
      return;
    }
    if (selectedProjectId && !searchParams?.get("projectId") && !selectedCustomerId) {
      updateUrl({ projectId: selectedProjectId, customerId: null });
    }
  }, [selectedCustomerId, selectedProjectId, searchParams, updateUrl]);

  const handleSelectProject = useCallback(
    (projectId: string, jumpToTab?: string) => {
      const nextTab = jumpToTab ?? "overview";
      setSelectedProjectId(projectId);
      setSelectedCustomerId(null);
      setActiveTab(nextTab);
      updateUrl({ projectId, customerId: null, tab: nextTab });
      setMobileView("detail");
    },
    [updateUrl]
  );

  const handleSelectCustomer = useCallback(
    (customerId: string) => {
      setSelectedCustomerId(customerId);
      setSelectedProjectId(null);
      updateUrl({ customerId, projectId: null, tab: null });
      setMobileView("detail");
    },
    [updateUrl]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      updateUrl({ tab });
    },
    [updateUrl]
  );

  const handleSaveEditProject = useCallback(
    async (data: ProjectInsert, assigneeIds: string[]) => {
      if (!editingProject) return;
      const projectId = editingProject.id;
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

      const typeChanged = cleaned.type_id !== editingProject.type_id;
      if (typeChanged && editingProject.drive_folder_id) {
        try {
          const oldRes = await fetch("/api/drive/type-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ typeId: editingProject.type_id }),
          });
          const fromFolderId = oldRes.ok ? (await oldRes.json()).driveFolderId : null;
          const newRes = await fetch("/api/drive/type-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ typeId: cleaned.type_id }),
          });
          const toFolderId = newRes.ok ? (await newRes.json()).driveFolderId : null;
          if (fromFolderId && toFolderId && fromFolderId !== toFolderId) {
            const moveRes = await fetch("/api/drive/move", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileIds: [editingProject.drive_folder_id],
                fromFolderId,
                toFolderId,
              }),
            });
            if (!moveRes.ok) {
              toast.warning("프로젝트 유형이 변경되었지만 Drive 폴더 이동에 실패했습니다.");
            }
          }
        } catch {
          toast.warning("프로젝트 유형이 변경되었지만 Drive 폴더 이동에 실패했습니다.");
        }
      }

      const { error: updateError } = await supabase
        .from("projects")
        .update(cleaned)
        .eq("id", projectId);
      if (updateError) {
        toast.error("프로젝트 수정에 실패했습니다.");
        return;
      }

      const { error: deleteAssigneeError } = await supabase
        .from("project_assignees")
        .delete()
        .eq("project_id", projectId);
      if (deleteAssigneeError) {
        toast.error("프로젝트 담당자 갱신에 실패했습니다.");
        return;
      }

      if (assigneeIds.length > 0) {
        const { error: insertAssigneeError } = await supabase
          .from("project_assignees")
          .insert(assigneeIds.map((employee_id) => ({ project_id: projectId, employee_id })));
        if (insertAssigneeError) {
          toast.error("프로젝트 담당자 저장에 실패했습니다.");
          return;
        }
      }

      toast.success("프로젝트가 수정되었습니다.");
      sendLog("UPDATE_PROJECT", `프로젝트 수정: ${data.name}`, {
        resource: "project",
        resource_id: projectId,
      });
      setEditingProject(null);
      router.refresh();
    },
    [editingProject, customers, supabase, router]
  );

  const handleLayoutChange = useCallback(
    (layout: Record<string, number> | number[]) => {
      try {
        const obj = Array.isArray(layout)
          ? { list: layout[0], context: layout[1], today: layout[2] }
          : { list: layout.list, context: layout.context, today: layout.today };
        if (
          typeof obj.list === "number" &&
          typeof obj.context === "number" &&
          typeof obj.today === "number"
        ) {
          localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(obj));
        }
      } catch {
        // ignore
      }
    },
    []
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;

  const listSize = savedLayout?.list ?? 22;
  const contextSize = savedLayout?.context ?? 53;
  const todaySize = savedLayout?.today ?? 25;

  const listPane = (
    <ProjectListPane
      projects={projects}
      customers={customers}
      employees={employees}
      projectTypes={projectTypes}
      selectedProjectId={selectedProjectId}
      selectedCustomerId={selectedCustomerId}
      onSelect={handleSelectProject}
      onSelectCustomer={handleSelectCustomer}
      onProjectCreated={(projectId) => {
        router.refresh();
        if (projectId) {
          handleSelectProject(projectId);
        }
      }}
      onCreateCustomer={() => setCustomerDialogOpen(true)}
    />
  );

  const contextPane = selectedCustomerId ? (
    <CustomerContextPane
      customer={selectedCustomer}
      projects={projects}
      selectedCustomerId={selectedCustomerId}
      onSelectProject={handleSelectProject}
      onCreateCustomer={() => setCustomerDialogOpen(true)}
    />
  ) : (
    <ProjectContextPane
      project={selectedProject}
      projects={projects}
      employees={employees}
      currentEmployeeId={currentEmployeeId}
      currentEmployeeName={currentEmployeeName}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onEditProject={() => {
        if (selectedProject) setEditingProject(selectedProject);
      }}
      onSelectCustomer={handleSelectCustomer}
    />
  );

  const todayPane = (
    <TodayPane
      projects={projects}
      employees={employees}
      currentEmployeeId={currentEmployeeId}
      onJumpToProject={(projectId, tab) => {
        handleSelectProject(projectId, tab);
      }}
    />
  );

  return (
    <>
      <div className="hidden h-full w-full md:block">
        {layoutReady ? (
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-full w-full"
            onLayoutChanged={handleLayoutChange}
          >
            <ResizablePanel
              id="list"
              defaultSize={`${listSize}%`}
              minSize="16%"
              maxSize="32%"
            >
              <div className="h-full min-w-0">{listPane}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="context"
              defaultSize={`${contextSize}%`}
              minSize="30%"
            >
              <div className="h-full min-w-0">{contextPane}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="today"
              defaultSize={`${todaySize}%`}
              minSize="18%"
              maxSize="36%"
            >
              <div className="h-full min-w-0">{todayPane}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : null}
      </div>

      <div className="flex h-[calc(100vh-5rem)] flex-col md:hidden">
        <div className="flex shrink-0 border-b border-border/60 bg-background/60">
          <MobileTab active={mobileView === "list"} onClick={() => setMobileView("list")}>
            검색
          </MobileTab>
          <MobileTab
            active={mobileView === "detail"}
            onClick={() => setMobileView("detail")}
            disabled={!selectedProjectId && !selectedCustomerId}
          >
            상세
          </MobileTab>
          <MobileTab active={mobileView === "today"} onClick={() => setMobileView("today")}>
            오늘
          </MobileTab>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {mobileView === "list" && listPane}
          {mobileView === "detail" && contextPane}
          {mobileView === "today" && todayPane}
        </div>
      </div>

      <ProjectDialog
        open={editingProject !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProject(null);
        }}
        project={editingProject}
        customers={customers}
        employees={employees}
        projectTypes={projectTypes}
        onSave={handleSaveEditProject}
      />

      <CommandPalette
        projects={projects}
        customers={customers}
        onSelectCustomer={handleSelectCustomer}
        onSelectProject={handleSelectProject}
      />

      <CustomerCreateDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(customerId) => {
          router.refresh();
          handleSelectCustomer(customerId);
        }}
      />
    </>
  );
}

function MobileTab({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-b-2 border-primary text-foreground"
          : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
        disabled && "opacity-40"
      )}
    >
      {children}
    </button>
  );
}

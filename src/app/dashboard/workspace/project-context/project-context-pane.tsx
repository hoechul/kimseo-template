"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Project } from "@/lib/types";

import { TabOverview } from "./tab-overview";
import { TabNotes } from "./tab-notes";
import { TabTasks } from "./tab-tasks";
import { TabSchedules } from "./tab-schedules";
import { TabFiles } from "./tab-files";
import { TabRevenues } from "./tab-revenues";

interface ProjectContextPaneProps {
  project: Project | null;
  projects: Project[];
  employees: Employee[];
  currentEmployeeId: string | null;
  currentEmployeeName: string | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onEditProject: () => void;
  onSelectCustomer: (customerId: string) => void;
}

interface ProjectCounts {
  tasksOpen: number;
  tasksTotal: number;
  notes: number;
  revenuesUnpaid: number;
}

const SECTIONS = [
  { id: "overview", label: "개요" },
  { id: "notes", label: "메모" },
  { id: "tasks", label: "할일" },
  { id: "schedules", label: "일정" },
  { id: "files", label: "파일" },
  { id: "revenues", label: "매출" },
] as const;

export function ProjectContextPane({
  project,
  projects,
  employees,
  currentEmployeeId,
  currentEmployeeName,
  activeTab,
  onTabChange,
  onEditProject,
  onSelectCustomer,
}: ProjectContextPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [counts, setCounts] = useState<ProjectCounts | null>(null);

  const projectId = project?.id ?? null;

  const refreshCounts = useCallback(async () => {
    if (!projectId) {
      setCounts(null);
      return;
    }
    const [tasksOpen, tasksTotal, notes, revenuesUnpaid] = await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .not("status", "in", "(완료,취소)"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
      supabase
        .from("project_notes")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
      supabase
        .from("revenues")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("is_paid", false),
    ]);
    setCounts({
      tasksOpen: tasksOpen.count ?? 0,
      tasksTotal: tasksTotal.count ?? 0,
      notes: notes.count ?? 0,
      revenuesUnpaid: revenuesUnpaid.count ?? 0,
    });
  }, [projectId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    if (!projectId) return;
    const filter = `project_id=eq.${projectId}`;
    const channel = supabase
      .channel(`workspace-counts-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter },
        () => {
          void refreshCounts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_notes", filter },
        () => {
          void refreshCounts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "revenues", filter },
        () => {
          void refreshCounts();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, supabase, refreshCounts]);

  useEffect(() => {
    if (!project) return;
    if (activeTab === "overview" || !activeTab) {
      scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    const el = document.getElementById(`section-${activeTab}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, project]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        왼쪽에서 프로젝트를 선택하세요
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="min-w-0">
          <Link
            href={`/dashboard/projects/${project.id}`}
            className="block truncate text-base font-semibold text-foreground hover:underline"
            title="프로젝트 상세 페이지로 이동"
          >
            {mask("title", project.name)}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="truncate">
              {project.customers ? (
                <button
                  type="button"
                  onClick={() => {
                    if (project.customers) onSelectCustomer(project.customers.id);
                  }}
                  className="hover:text-foreground hover:underline"
                >
                  {mask("customer_name", project.customers.name)}
                </button>
              ) : (
                "—"
              )}{" "}
              · {project.status}
              {project.project_number ? ` · ${project.project_number}` : ""}
            </span>
            {counts ? (
              <span className="flex items-center gap-1.5">
                <CountChip
                  label="할일"
                  value={`${counts.tasksOpen}/${counts.tasksTotal}`}
                  tone={counts.tasksOpen > 0 ? "warn" : "default"}
                />
                <CountChip label="메모" value={counts.notes} />
                <CountChip
                  label="미입금"
                  value={counts.revenuesUnpaid}
                  tone={counts.revenuesUnpaid > 0 ? "danger" : "default"}
                />
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <nav className="hidden gap-0.5 md:flex">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onTabChange(s.id)}
                className="rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </nav>
          <Button type="button" size="sm" variant="outline" onClick={onEditProject}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            수정
          </Button>
        </div>
      </div>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/60 bg-background/80 px-2 py-1.5 md:hidden">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onTabChange(s.id)}
            className={
              "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
              (activeTab === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <Section
          key={`${project.id}-overview`}
          id="overview"
          label="개요"
          scrollRef={scrollRef}
          activeTab={activeTab}
          eager
        >
          <TabOverview project={project} onSelectCustomer={onSelectCustomer} />
        </Section>
        <Section
          key={`${project.id}-notes`}
          id="notes"
          label="메모"
          scrollRef={scrollRef}
          activeTab={activeTab}
        >
          <TabNotes
            project={project}
            currentEmployeeId={currentEmployeeId}
            currentEmployeeName={currentEmployeeName}
          />
        </Section>
        <Section
          key={`${project.id}-tasks`}
          id="tasks"
          label="할일"
          scrollRef={scrollRef}
          activeTab={activeTab}
        >
          <TabTasks
            project={project}
            projects={projects}
            employees={employees}
            currentEmployeeId={currentEmployeeId}
          />
        </Section>
        <Section
          key={`${project.id}-schedules`}
          id="schedules"
          label="일정"
          scrollRef={scrollRef}
          activeTab={activeTab}
        >
          <TabSchedules
            project={project}
            projects={projects}
            employees={employees}
            currentEmployeeId={currentEmployeeId}
          />
        </Section>
        <Section
          key={`${project.id}-files`}
          id="files"
          label="파일"
          scrollRef={scrollRef}
          activeTab={activeTab}
        >
          <TabFiles project={project} />
        </Section>
        <Section
          key={`${project.id}-revenues`}
          id="revenues"
          label="매출"
          scrollRef={scrollRef}
          activeTab={activeTab}
        >
          <TabRevenues project={project} />
        </Section>
      </div>
    </div>
  );
}

function CountChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-rose-100 text-rose-700"
      : tone === "warn"
      ? "bg-amber-100 text-amber-700"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${toneClass}`}>
      {label} {value}
    </span>
  );
}

function Section({
  id,
  label,
  scrollRef,
  activeTab,
  eager = false,
  children,
}: {
  id: string;
  label: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  activeTab: string;
  eager?: boolean;
  children: React.ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(eager);
  const isActive = activeTab === id;

  useEffect(() => {
    if (hasBeenVisible) return;
    const root = scrollRef.current;
    const target = sectionRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHasBeenVisible(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRef, hasBeenVisible]);

  const shouldRender = hasBeenVisible || isActive;

  return (
    <section
      ref={sectionRef}
      id={`section-${id}`}
      className="border-b border-border/60 last:border-b-0"
    >
      <header className="sticky top-0 z-10 border-b border-border/40 bg-muted/60 px-4 py-1 backdrop-blur">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h3>
      </header>
      <div className="min-h-[60px] px-4 py-2.5">
        {shouldRender ? (
          children
        ) : (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
            스크롤하면 불러옵니다…
          </div>
        )}
      </div>
    </section>
  );
}

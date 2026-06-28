"use client";

import Link from "next/link";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { LoadingState, PageHeader, PageShell, PageToolbar } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskForm } from "@/components/task-form";
import { sendLog } from "@/lib/log-client";
import { buildTaskAssigneeRows, normalizeTaskAssigneeIds } from "@/lib/task-assignees";
import { notifyTaskCreated } from "@/lib/tasks/slack-notify";
import { createClient } from "@/lib/supabase/client";
import type { Employee, Project, TaskInsert } from "@/lib/types";

function NewTaskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const defaultProjectId = searchParams.get("projectId");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [employeeRes, projectRes, authRes] = await Promise.all([
        supabase.from("employees").select("id, name").order("name").limit(500),
        supabase.from("projects").select("id, project_number, name").order("created_at", { ascending: false }).limit(500),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;

      if (employeeRes.error) {
        console.error("직원 목록 조회 실패:", employeeRes.error.message);
        toast.error("직원 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setEmployees([]);
      } else {
        setEmployees((employeeRes.data ?? []) as Employee[]);
      }

      if (projectRes.error) {
        console.error("프로젝트 목록 조회 실패:", projectRes.error.message);
        toast.error("프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setProjects([]);
      } else {
        setProjects((projectRes.data ?? []) as Project[]);
      }

      const authUser = authRes.data.user;

      if (authUser) {
        const { data: currentEmployee, error: currentEmployeeError } = await supabase
          .from("employees")
          .select("id")
          .eq("auth_uid", authUser.id)
          .maybeSingle();

        if (cancelled) return;

        if (currentEmployeeError) console.error("현재 사용자 조회 실패:", currentEmployeeError.message);
        setCreatedBy(currentEmployee?.id ?? null);
      } else {
        setCreatedBy(null);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSave = async (data: TaskInsert) => {
    const { data: maxRow, error: maxRowError } = await supabase
      .from("tasks")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxRowError) console.error("정렬 순서 조회 실패:", maxRowError.message);
    const nextOrder = (maxRow?.sort_order ?? 0) + 1;

    const assigneeIds = normalizeTaskAssigneeIds(data.assignee_ids ?? [data.assigned_to]);
    const payload = {
      title: data.title.trim(),
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      assigned_to: assigneeIds[0] ?? null,
      start_date: data.start_date || null,
      due_date: data.due_date || null,
      project_id: data.project_id || defaultProjectId || null,
      estimated_minutes: data.estimated_minutes ?? null,
      created_by: data.created_by || createdBy || null,
      sort_order: nextOrder,
    };

    const { data: inserted, error } = await supabase.from("tasks").insert(payload).select("id").single();

    if (error) {
      console.error("할일 추가 실패:", error.message);
      toast.error("할일 추가에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (assigneeIds.length > 0) {
      const { error: assigneeError } = await supabase
        .from("task_assignees")
        .insert(buildTaskAssigneeRows(inserted.id, assigneeIds));

      if (assigneeError) {
        await supabase.from("tasks").delete().eq("id", inserted.id);
        console.error("담당자 저장 실패:", assigneeError.message);
        toast.error("담당자 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
    }

    sendLog("CREATE_TASK", `할일 추가: ${payload.title}`, {
      resource: "task",
      resource_id: inserted.id,
    });

    await notifyTaskCreated(inserted.id);

    toast.success("할일이 추가되었습니다.");
    router.push(`/dashboard/tasks/${inserted.id}`);
  };

  if (loading) {
    return (
      <LoadingState
        title="할일 작성 화면을 준비하는 중입니다."
        description="담당자와 프로젝트 목록을 불러오고 있습니다."
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "할일관리", href: "/dashboard/tasks" },
          { label: "신규 등록" },
        ]}
        title="할일 추가"
        funKey="tasks"
        titleAccessory={defaultProjectId ? <Badge variant="secondary">프로젝트 연결 예정</Badge> : null}
        description={
          defaultProjectId
            ? "선택한 프로젝트에 연결될 할일을 바로 등록합니다."
            : "할 일과 백로그를 프로젝트와 연결해서 등록합니다."
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/tasks">
              <ArrowLeft className="h-4 w-4" />
              목록으로
            </Link>
          </Button>
        }
      />

      <PageToolbar className="gap-4 bg-gradient-to-r from-primary/7 via-background to-secondary/40">
        <div className="flex items-start gap-4 rounded-[1.25rem] border border-border/70 bg-background/75 px-4 py-4">
          <div className="rounded-2xl border border-primary/10 bg-primary/8 p-3 text-primary">
            <ClipboardPlus className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">빠른 등록 팁</p>
            <p className="text-sm leading-6 text-muted-foreground">
              제목과 담당자, 마감일만 먼저 등록한 뒤 상세 페이지에서 우선순위와 설명을 이어서 다듬어도 됩니다.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-border/70 bg-background/75 px-4 py-4 text-sm leading-6 text-muted-foreground">
            기본 정보만 먼저 저장해도 목록과 대시보드에 바로 반영됩니다.
          </div>
          <div className="rounded-[1.25rem] border border-border/70 bg-background/75 px-4 py-4 text-sm leading-6 text-muted-foreground">
            프로젝트를 함께 연결하면 상세 화면 이동 없이 진행 흐름을 추적하기 쉬워집니다.
          </div>
        </div>
      </PageToolbar>

      <TaskForm
        task={null}
        employees={employees}
        projects={projects}
        createdBy={createdBy}
        defaultProjectId={defaultProjectId}
        onSave={handleSave}
        onCancel={() => router.push("/dashboard/tasks")}
      />
    </PageShell>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense
      fallback={
        <LoadingState
          title="할일 작성 화면을 준비하는 중입니다."
          description="필수 데이터를 불러오고 있습니다."
        />
      }
    >
      <NewTaskPageContent />
    </Suspense>
  );
}

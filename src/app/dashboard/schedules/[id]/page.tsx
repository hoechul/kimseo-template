"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Button } from "@/components/ui/button";
import { ScheduleView } from "@/components/schedule-view";
import { ScheduleRecurrenceScopeDialog } from "@/components/schedule-recurrence-scope-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { setLoadedCategories } from "@/components/calendar/calendar-utils";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { getCache, setCache, invalidateCache } from "@/lib/simple-cache";
import type {
  Employee,
  Schedule,
  ScheduleCategoryItem,
  ScheduleRecurrenceActionScope,
} from "@/lib/types";

function isRecurringSchedule(schedule: Pick<Schedule, "recurrence_type" | "recurrence_group_id">) {
  return schedule.recurrence_type !== "none" && Boolean(schedule.recurrence_group_id);
}

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const scheduleId = params?.id ?? "";

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<ScheduleCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recurrenceScopeOpen, setRecurrenceScopeOpen] = useState(false);

  useEffect(() => {
    if (!scheduleId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(false);

      const cachedEmployees = getCache<Employee[]>("schedules:employees");
      const cachedCategories = getCache<ScheduleCategoryItem[]>("schedules:categories");

      if (cachedEmployees) setEmployees(cachedEmployees);
      if (cachedCategories) {
        setCategories(cachedCategories);
        setLoadedCategories(cachedCategories);
      }

      await supabase.auth.getSession();

      const [scheduleRes, employeeRes, categoryRes] = await Promise.all([
        supabase
          .from("schedules")
          .select(
            "*, attendees:schedule_attendees(employee_id, employees(id, name, department)), projects(id, project_number, name), customers(id, name), leads(id, company_name)"
          )
          .eq("id", scheduleId)
          .single(),
        cachedEmployees
          ? Promise.resolve({ data: cachedEmployees, error: null })
          : supabase.from("employees").select("id, name, department, auth_uid").order("name").limit(500),
        cachedCategories
          ? Promise.resolve({ data: cachedCategories, error: null })
          : supabase.from("schedule_categories").select("id, value, label, color, sort_order, created_at").order("sort_order").limit(500),
      ]);

      if (scheduleRes.error || !scheduleRes.data) {
        console.error("일정 조회 실패:", scheduleRes.error?.message);
        setError(true);
        setLoading(false);
        return;
      }

      setSchedule(scheduleRes.data as Schedule);

      if (employeeRes.data && !cachedEmployees) {
        const fresh = employeeRes.data as Employee[];
        setEmployees(fresh);
        setCache("schedules:employees", fresh);
      }

      if (categoryRes.data && !cachedCategories) {
        const fresh = categoryRes.data as ScheduleCategoryItem[];
        setCategories(fresh);
        setLoadedCategories(fresh);
        setCache("schedules:categories", fresh);
      }

      setLoading(false);
    };

    void fetchData();
  }, [scheduleId, supabase]);

  const handleEdit = () => {
    router.push(`/dashboard/schedules?edit=${scheduleId}`);
  };

  const handleShareLink = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("링크를 복사했습니다.");
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  }, []);

  const handleDeleteClick = () => {
    if (!schedule) return;
    if (isRecurringSchedule(schedule)) {
      setRecurrenceScopeOpen(true);
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const performDelete = useCallback(
    async (scope?: ScheduleRecurrenceActionScope) => {
      if (!schedule) return;
      setDeleting(true);
      try {
        const res = await fetch("/api/schedules/mutate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", scheduleId: schedule.id, scope }),
        });
        const result = await res.json().catch(() => null);

        if (!res.ok) {
          console.error("일정 삭제 실패:", result?.error ?? "알 수 없는 오류");
          toast.error("일정 삭제에 실패했습니다.");
          return;
        }

        toast.success(
          (result?.count ?? 1) > 1
            ? `반복 일정 ${result.count}건이 삭제되었습니다.`
            : "일정이 삭제되었습니다."
        );
        if (result?.warning) toast.warning(result.warning);
        sendLog("DELETE_SCHEDULE", "일정 삭제", { resource: "schedule", resource_id: schedule.id });
        invalidateCache("schedules:range:", true);
        router.push("/dashboard/schedules");
      } finally {
        setDeleting(false);
      }
    },
    [schedule, router]
  );

  const handleDeleteConfirm = async () => {
    setDeleteConfirmOpen(false);
    await performDelete();
  };

  const handleRecurrenceScopeSelect = async (scope: ScheduleRecurrenceActionScope) => {
    setRecurrenceScopeOpen(false);
    await performDelete(scope);
  };

  if (loading) {
    return (
      <PageShell>
        <LoadingState title="일정을 불러오는 중입니다." description="잠시만 기다려주세요." />
      </PageShell>
    );
  }

  if (error || !schedule) {
    return (
      <PageShell>
        <ErrorState
          description="일정을 불러오지 못했습니다."
          action={
            <Button variant="outline" onClick={() => router.push("/dashboard/schedules")}>
              일정 목록으로
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={mask("title", schedule.title)}
        funKey="schedules"
        description="일정 정보와 참석자, 관련 항목을 확인합니다."
        breadcrumbs={[
          { label: "일정관리", href: "/dashboard/schedules" },
          { label: mask("title", schedule.title) },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handleShareLink}
            >
              <Link2 className="h-4 w-4" />
              링크 복사
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleEdit}>
              수정
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleDeleteClick}
              disabled={deleting}
            >
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </>
        }
      />

      <div className="rounded-[1.5rem] border border-border/70 bg-card/90 p-5 shadow-sm sm:p-6">
        <ScheduleView schedule={schedule} employees={employees} categories={categories} />
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>일정 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말 이 일정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScheduleRecurrenceScopeDialog
        open={recurrenceScopeOpen}
        onOpenChange={setRecurrenceScopeOpen}
        action="delete"
        loading={deleting}
        onSelect={handleRecurrenceScopeSelect}
      />
    </PageShell>
  );
}

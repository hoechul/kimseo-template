"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ScheduleDialog } from "@/components/schedule-dialog";
import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import { formatKstDateLabel, formatKstTime } from "@/lib/date";
import type {
  Employee,
  Project,
  RecurrenceType,
  Schedule,
  ScheduleCategoryItem,
  ScheduleInsert,
  ScheduleRecurrenceActionScope,
} from "@/lib/types";

interface TabSchedulesProps {
  project: Project;
  projects: Project[];
  employees: Employee[];
  currentEmployeeId: string | null;
}

const SCHEDULE_SELECT =
  "*, creator:employees!created_by(id, name), attendees:schedule_attendees(id, schedule_id, employee_id, created_at, employees(id, name, department))";

export function TabSchedules({ project, projects, employees, currentEmployeeId }: TabSchedulesProps) {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [categories, setCategories] = useState<ScheduleCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Schedule | null>(null);

  const refresh = useCallback(async () => {
    const [schedRes, catRes] = await Promise.all([
      supabase
        .from("schedules")
        .select(SCHEDULE_SELECT)
        .eq("project_id", project.id)
        .order("start_at", { ascending: true }),
      supabase.from("schedule_categories").select("*").order("sort_order"),
    ]);

    if (schedRes.error) {
      toast.error("일정 목록을 불러오지 못했습니다.");
    } else {
      setSchedules((schedRes.data ?? []) as Schedule[]);
    }
    if (catRes.data) {
      setCategories(catRes.data as ScheduleCategoryItem[]);
    }
  }, [project.id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`workspace-schedules-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "schedules",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedule_attendees" },
        () => {
          void refresh();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [project.id, supabase, refresh]);

  const handleAdd = () => {
    setSelected(null);
    setDialogOpen(true);
  };

  const handleOpen = (schedule: Schedule) => {
    setSelected(schedule);
    setDialogOpen(true);
  };

  const handleSave = async (
    data: ScheduleInsert,
    attendeeIds: string[],
    recurrence?: { type: RecurrenceType; endDate: string | null },
    options?: { addGoogleMeet?: boolean },
    scope?: ScheduleRecurrenceActionScope
  ): Promise<boolean> => {
    if (new Date(data.end_at).getTime() <= new Date(data.start_at).getTime()) {
      toast.error("종료 일시는 시작 일시보다 이후여야 합니다.");
      return false;
    }

    if (!selected) {
      const scheduleData = { ...data, project_id: data.project_id ?? project.id };
      const body: Record<string, unknown> = {
        action: "create",
        schedule: scheduleData,
        attendeeIds,
        addGoogleMeet: options?.addGoogleMeet,
      };
      if (recurrence && recurrence.type !== "none" && recurrence.endDate) {
        body.recurrence = recurrence;
      }
      const res = await fetch("/api/schedules/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("일정 등록에 실패했습니다.");
        return false;
      }
      toast.success(
        result?.count > 1 ? `반복 일정 ${result.count}건이 등록되었습니다.` : "일정이 등록되었습니다."
      );
      if (result?.warning) toast.warning(result.warning);
      sendLog("CREATE_SCHEDULE", `일정 등록: ${data.title}`, {
        resource: "schedule",
        resource_id: String(result?.id ?? result?.ids?.[0] ?? ""),
      });
      await refresh();
      return true;
    }

    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        scheduleId: selected.id,
        schedule: data,
        attendeeIds,
        scope,
      }),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error("일정 수정에 실패했습니다.");
      return false;
    }
    toast.success(
      (result?.count ?? 1) > 1
        ? `반복 일정 ${result.count}건이 수정되었습니다.`
        : "일정이 수정되었습니다."
    );
    if (result?.warning) toast.warning(result.warning);
    sendLog("UPDATE_SCHEDULE", `일정 수정: ${data.title}`, {
      resource: "schedule",
      resource_id: selected.id,
    });
    await refresh();
    return true;
  };

  const handleDelete = async (
    scheduleId: string,
    scope?: ScheduleRecurrenceActionScope
  ): Promise<boolean> => {
    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", scheduleId, scope }),
    });
    if (!res.ok) {
      toast.error("일정 삭제에 실패했습니다.");
      return false;
    }
    toast.success("일정이 삭제되었습니다.");
    sendLog("DELETE_SCHEDULE", `일정 삭제`, {
      resource: "schedule",
      resource_id: scheduleId,
    });
    await refresh();
    return true;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{schedules.length}개의 일정</div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          일정 추가
        </Button>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          불러오는 중…
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          등록된 일정이 없습니다.
        </div>
      ) : (
        <div className="space-y-1">
          {schedules.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleOpen(s)}
              className="block w-full rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">{mask("title", s.title)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatKstDateLabel(s.start_at)}
                  {s.all_day ? " · 종일" : ` · ${formatKstTime(s.start_at)}`}
                </span>
              </div>
              {s.location ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.location}</div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setSelected(null);
        }}
        schedule={selected}
        employees={employees}
        projects={projects}
        categories={categories}
        currentEmployeeId={currentEmployeeId}
        defaultProjectId={project.id}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

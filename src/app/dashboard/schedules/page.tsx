"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { usePersistedTab } from "@/lib/use-persisted-tab";
import { useIsMobile } from "@/lib/use-is-mobile";
import { getCache, setCache, invalidateCache, isNavigationReload } from "@/lib/simple-cache";
import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import { CalendarDayView } from "@/components/calendar/calendar-day-view";
import { EmployeeFilter } from "@/components/calendar/employee-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingState, PageShell } from "@/components/page-shell";
import { ScheduleRecurrenceScopeDialog } from "@/components/schedule-recurrence-scope-dialog";
import { ScheduleDialog } from "@/components/schedule-dialog";
import {
  type ViewMode,
  getVisibleRange,
  setHours,
  setLoadedCategories,
} from "@/components/calendar/calendar-utils";
import type { FilterMode } from "@/components/calendar/employee-filter";
import type {
  Customer,
  Employee,
  Lead,
  Project,
  RecurrenceType,
  Schedule,
  ScheduleCategoryItem,
  ScheduleInsert,
  ScheduleRecurrenceActionScope,
} from "@/lib/types";

const VIEW_MODES = ["month", "week", "day"] as const;
const DEFAULT_SCHEDULE_NOTIFICATION_TIME = "07:00";
const DEFAULT_SCHEDULE_NOTIFICATION_CHANNEL = "#random";

interface ScheduleNotificationSettingsForm {
  schedule_time: string;
  schedule_channel: string;
}

function hasValidScheduleRange(startAt: string, endAt: string) {
  return new Date(endAt).getTime() > new Date(startAt).getTime();
}

function isRecurringSchedule(schedule: Pick<Schedule, "recurrence_type" | "recurrence_group_id">) {
  return schedule.recurrence_type !== "none" && Boolean(schedule.recurrence_group_id);
}

export default function SchedulesPage() {
  return (
    <Suspense>
      <SchedulesPageInner />
    </Suspense>
  );
}

function SchedulesPageInner() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { mask } = useMasking();
  const editIdHandled = useRef<string | null>(null);
  const shouldBypassInitialRangeCache = useRef(isNavigationReload());

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode, viewModeReady] = usePersistedTab<ViewMode>(
    "dashboard.schedules.view-mode",
    "month",
    VIEW_MODES
  );
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [categories, setCategories] = useState<ScheduleCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogOptionsLoaded, setDialogOptionsLoaded] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | undefined>();
  const [defaultEnd, setDefaultEnd] = useState<string | undefined>();
  const [defaultAllDay, setDefaultAllDay] = useState<boolean | undefined>();
  const [pendingTimeChange, setPendingTimeChange] = useState<{
    schedule: Schedule;
    startAt: string;
    endAt: string;
  } | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<ScheduleNotificationSettingsForm>({
    schedule_time: DEFAULT_SCHEDULE_NOTIFICATION_TIME,
    schedule_channel: DEFAULT_SCHEDULE_NOTIFICATION_CHANNEL,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "d" || key === "ㅇ") setViewMode("day");
      else if (key === "w" || key === "ㅈ") setViewMode("week");
      else if (key === "m" || key === "ㅡ") setViewMode("month");
      else if (event.key === "ArrowLeft") {
        setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
      } else if (event.key === "ArrowRight") {
        setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setViewMode]);

  useEffect(() => {
    const fetchInitial = async () => {
      // Apply cache for employees + categories first to render instantly on revisit
      const cachedEmployees = getCache<Employee[]>("schedules:employees");
      const cachedCategories = getCache<ScheduleCategoryItem[]>("schedules:categories");

      if (cachedEmployees) {
        setEmployees(cachedEmployees);
        setSelectedEmployeeIds(cachedEmployees.map((employee) => employee.id));
      }
      if (cachedCategories) {
        setCategories(cachedCategories);
        setLoadedCategories(cachedCategories);
      }

      await supabase.auth.getSession();

      const [authRes, employeeRes, categoryRes] = await Promise.all([
        supabase.auth.getUser(),
        cachedEmployees
          ? Promise.resolve({ data: cachedEmployees, error: null })
          : supabase.from("employees").select("id, name, department, auth_uid").order("name").limit(500),
        cachedCategories
          ? Promise.resolve({ data: cachedCategories, error: null })
          : supabase.from("schedule_categories").select("id, value, label, color, sort_order, created_at").order("sort_order").limit(500),
      ]);

      if (employeeRes.data) {
        const fresh = employeeRes.data as Employee[];
        if (!cachedEmployees) {
          setEmployees(fresh);
          setSelectedEmployeeIds(fresh.map((employee) => employee.id));
          setCache("schedules:employees", fresh);
        }

        const user = authRes.data.user;
        if (user) {
          const match = fresh.find((employee) => employee.auth_uid === user.id);
          if (match) setCurrentEmployeeId(match.id);
        }
      }

      if (categoryRes.data && !cachedCategories) {
        const loadedCategories = categoryRes.data as ScheduleCategoryItem[];
        setCategories(loadedCategories);
        setLoadedCategories(loadedCategories);
        setCache("schedules:categories", loadedCategories);
      }
    };

    fetchInitial();
  }, [supabase]);

  useEffect(() => {
    if (!dialogOpen || dialogOptionsLoaded) return;

    (async () => {
      const cachedProjects = getCache<Project[]>("schedules:projects");
      const cachedCustomers = getCache<Customer[]>("schedules:customers");
      const cachedLeads = getCache<Lead[]>("schedules:leads");

      if (cachedProjects) setProjects(cachedProjects);
      if (cachedCustomers) setCustomers(cachedCustomers);
      if (cachedLeads) setLeads(cachedLeads);

      const [projectRes, customerRes, leadRes] = await Promise.all([
        cachedProjects
          ? Promise.resolve({ data: cachedProjects })
          : supabase.from("projects").select("id, project_number, name, client").order("name").limit(500),
        cachedCustomers
          ? Promise.resolve({ data: cachedCustomers })
          : supabase.from("customers").select("id, name, business_number").order("name").limit(500),
        cachedLeads
          ? Promise.resolve({ data: cachedLeads })
          : supabase.from("leads").select("id, company_name, contact_name").order("company_name").limit(500),
      ]);

      if (projectRes.data && !cachedProjects) {
        setProjects(projectRes.data as Project[]);
        setCache("schedules:projects", projectRes.data);
      }
      if (customerRes.data && !cachedCustomers) {
        setCustomers(customerRes.data as Customer[]);
        setCache("schedules:customers", customerRes.data);
      }
      if (leadRes.data && !cachedLeads) {
        setLeads(leadRes.data as Lead[]);
        setCache("schedules:leads", leadRes.data);
      }
      setDialogOptionsLoaded(true);
    })();
  }, [dialogOpen, dialogOptionsLoaded, supabase]);

  const fetchNotificationSettings = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const res = await fetch("/api/settings/slack");
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "알림 설정을 불러오지 못했습니다.");
      }

      setNotificationSettings({
        schedule_time: data?.schedule_time || DEFAULT_SCHEDULE_NOTIFICATION_TIME,
        schedule_channel: data?.schedule_channel || DEFAULT_SCHEDULE_NOTIFICATION_CHANNEL,
      });
    } catch (e) {
      console.error("알림 설정 조회 실패:", e instanceof Error ? e.message : String(e));
      toast.error("알림 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setNotificationLoading(false);
  }, []);

  const fetchSchedules = useCallback(async (options: { skipCache?: boolean } = {}) => {
    const { start, end } = getVisibleRange(currentDate, viewMode);
    const cacheKey = `schedules:range:${start}:${end}`;
    const skipRangeCache = options.skipCache || shouldBypassInitialRangeCache.current;

    if (skipRangeCache) {
      // After a mutation, all month ranges may be stale (e.g. created event in future month)
      invalidateCache("schedules:range:", true);
    } else {
      const cached = getCache<Schedule[]>(cacheKey);
      if (cached) {
        setSchedules(cached);
        setError(false);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const { data, error: fetchError } = await supabase
      .from("schedules")
      .select(
        "*, attendees:schedule_attendees(employee_id, employees(id, name, department)), projects(id, project_number, name), customers(id, name), leads(id, company_name)"
      )
      .gte("start_at", start)
      .lte("start_at", end)
      .order("start_at");

    if (fetchError) {
      console.error("일정 조회 실패:", fetchError.message);
      toast.error("일정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setError(true);
      setSchedules([]);
    } else {
      const fresh = data ?? [];
      setSchedules(fresh);
      setCache(cacheKey, fresh);
    }

    shouldBypassInitialRangeCache.current = false;
    setLoading(false);
  }, [supabase, currentDate, viewMode]);

  useEffect(() => {
    if (!viewModeReady) return;

    void fetchSchedules();
  }, [fetchSchedules, viewModeReady]);

  // Auto-open edit dialog from ?edit=<id> query parameter
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || loading || editIdHandled.current === editId) return;
    editIdHandled.current = editId;

    const found = schedules.find((s) => s.id === editId);
    if (found) {
      openEditModal(found);
    } else {
      // Schedule not in current view range — fetch it directly
      (async () => {
        const { data } = await supabase
          .from("schedules")
          .select(
            "*, attendees:schedule_attendees(employee_id, employees(id, name, department)), projects(id, project_number, name), customers(id, name), leads(id, company_name)"
          )
          .eq("id", editId)
          .single();
        if (data) {
          openEditModal(data as Schedule);
        } else {
          toast.error("해당 일정을 찾을 수 없습니다.");
        }
      })();
    }
  }, [searchParams, schedules, loading, supabase]);

  const filteredSchedules = useMemo(() => {
    if (filterMode === "all") return schedules;

    if (filterMode === "unassigned") {
      return schedules.filter((schedule) => !schedule.attendees || schedule.attendees.length === 0);
    }

    return schedules.filter((schedule) => {
      const isAttendee = schedule.attendees?.some((attendee) =>
        selectedEmployeeIds.includes(attendee.employee_id)
      );
      return Boolean(isAttendee);
    });
  }, [filterMode, schedules, selectedEmployeeIds]);

  const displaySchedules = useMemo(() => {
    return filteredSchedules.map((schedule) => ({
      ...schedule,
      title: mask("title", schedule.title),
      location: schedule.location ? mask("address", schedule.location) : schedule.location,
      projects: schedule.projects
        ? { ...schedule.projects, name: mask("title", schedule.projects.name) }
        : schedule.projects,
      customers: schedule.customers
        ? { ...schedule.customers, name: mask("customer_name", schedule.customers.name) }
        : schedule.customers,
      leads: schedule.leads
        ? { ...schedule.leads, company_name: mask("customer_name", schedule.leads.company_name) }
        : schedule.leads,
      creator: schedule.creator
        ? { ...schedule.creator, name: mask("name", schedule.creator.name) }
        : schedule.creator,
      attendees: schedule.attendees?.map((attendee) =>
        attendee.employees
          ? {
              ...attendee,
              employees: { ...attendee.employees, name: mask("name", attendee.employees.name) },
            }
          : attendee
      ),
    }));
  }, [filteredSchedules, mask]);

  const employeeScheduleCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const schedule of schedules) {
      for (const attendee of schedule.attendees ?? []) {
        counts[attendee.employee_id] = (counts[attendee.employee_id] ?? 0) + 1;
      }
    }

    return counts;
  }, [schedules]);

  const unassignedCount = useMemo(
    () => schedules.filter((schedule) => !schedule.attendees || schedule.attendees.length === 0).length,
    [schedules]
  );

  const handleFilterChange = (mode: FilterMode, ids: string[]) => {
    setFilterMode(mode);
    setSelectedEmployeeIds(ids);
  };

  const openNewDialog = (start?: string, end?: string, allDay?: boolean) => {
    setEditingSchedule(null);
    setDefaultStart(start);
    setDefaultEnd(end);
    setDefaultAllDay(allDay);
    setDialogOpen(true);
  };

  const openEditModal = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setDefaultStart(undefined);
    setDefaultEnd(undefined);
    setDefaultAllDay(undefined);
    setDialogOpen(true);
  };

  const openEditDialog = (schedule: Schedule) => {
    // 마스킹된 표시용 객체가 넘어올 수 있으므로 항상 원본을 다시 찾는다.
    const original = schedules.find((s) => s.id === schedule.id) ?? schedule;
    if (isMobile) {
      router.push(`/dashboard/schedules/${original.id}`);
      return;
    }
    openEditModal(original);
  };

  const handleDateClick = (date: Date) => {
    const start = setHours(date, 9);
    const end = setHours(date, 10);
    openNewDialog(start.toISOString(), end.toISOString(), false);
  };

  const handleTimeClick = (date: Date, hour: number) => {
    const start = setHours(date, hour);
    const end = setHours(date, hour + 1);
    openNewDialog(start.toISOString(), end.toISOString(), false);
  };

  const handleSave = async (
    data: ScheduleInsert,
    attendeeIds: string[],
    recurrence?: { type: RecurrenceType; endDate: string | null },
    options?: { addGoogleMeet?: boolean },
    scope?: ScheduleRecurrenceActionScope
  ) => {
    if (!hasValidScheduleRange(data.start_at, data.end_at)) {
      toast.error("종료 일시는 시작 일시보다 이후여야 합니다.");
      return false;
    }

    if (editingSchedule) {
      const res = await fetch("/api/schedules/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          scheduleId: editingSchedule.id,
          schedule: data,
          attendeeIds,
          scope,
        }),
      });
      const result = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("일정 수정 실패:", result?.error ?? "알 수 없는 오류");
        toast.error("일정 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }
      if (result?.warning) toast.warning(result.warning);
      if ((result?.count ?? 1) > 1) {
        toast.success(`반복 일정 ${result.count}건이 수정되었습니다.`);
      }

      sendLog("UPDATE_SCHEDULE", `일정 수정: ${data.title}`, {
        resource: "schedule",
        resource_id: editingSchedule.id,
      });
    } else if (recurrence && recurrence.type !== "none" && recurrence.endDate) {
      const res = await fetch("/api/schedules/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          schedule: data,
          attendeeIds,
          recurrence,
          addGoogleMeet: options?.addGoogleMeet,
        }),
      });
      const result = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("반복 일정 등록 실패:", result?.error ?? "알 수 없는 오류");
        toast.error("반복 일정 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }

      toast.success(`반복 일정 ${result?.count ?? 0}건이 등록되었습니다.`);
      if (result?.warning) toast.warning(result.warning);
      sendLog("CREATE_SCHEDULE", `반복 일정 등록: ${data.title} (${result?.count ?? 0}건)`, {
        resource: "schedule",
        resource_id: String(result?.ids?.[0] ?? ""),
      });
    } else {
      const res = await fetch("/api/schedules/mutate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          schedule: data,
          attendeeIds,
          addGoogleMeet: options?.addGoogleMeet,
        }),
      });
      const result = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("일정 등록 실패:", result?.error ?? "알 수 없는 오류");
        toast.error("일정 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return false;
      }
      if (result?.warning) toast.warning(result.warning);

      sendLog("CREATE_SCHEDULE", `일정 등록: ${data.title}`, {
        resource: "schedule",
        resource_id: String(result?.id ?? ""),
      });
    }

    void fetchSchedules({ skipCache: true });
    return true;
  };

  const executeEventTimeChange = useCallback(async (
    schedule: Schedule,
    startAt: string,
    endAt: string,
    scope: ScheduleRecurrenceActionScope = "single"
  ) => {
    if (!hasValidScheduleRange(startAt, endAt)) {
      toast.error("종료 일시는 시작 일시보다 이후여야 합니다.");
      await fetchSchedules({ skipCache: true });
      return;
    }

    if (scope === "single" && !isRecurringSchedule(schedule)) {
      // 낙관적 업데이트: 드래그 프리뷰가 사라지기 전에 즉시 반영
      setSchedules((prev) =>
        prev.map((item) =>
          item.id === schedule.id
            ? {
                ...item,
                start_at: startAt,
                end_at: endAt,
                all_day: false,
              }
            : item
        )
      );
    }

    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        scheduleId: schedule.id,
        schedule: {
          title: schedule.title,
          description: schedule.description,
          start_at: startAt,
          end_at: endAt,
          all_day: false,
          category: schedule.category,
          location: schedule.location,
          project_id: schedule.project_id,
          customer_id: schedule.customer_id,
          lead_id: schedule.lead_id,
          recurrence_type: schedule.recurrence_type,
          recurrence_end_date: schedule.recurrence_end_date,
          recurrence_group_id: schedule.recurrence_group_id,
          created_by: schedule.created_by,
        },
        attendeeIds: schedule.attendees?.map((attendee) => attendee.employee_id) ?? [],
        scope,
      }),
    });
    const result = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("일정 시간 변경 실패:", result?.error ?? "알 수 없는 오류");
      toast.error("일정 시간 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
      await fetchSchedules({ skipCache: true });
      return;
    }
    if (result?.warning) toast.warning(result.warning);
    if ((result?.count ?? 1) > 1) {
      toast.success(`반복 일정 ${result.count}건의 시간이 변경되었습니다.`);
    }

    sendLog("UPDATE_SCHEDULE", `일정 시간 변경: ${schedule.title}`, {
      resource: "schedule",
      resource_id: schedule.id,
    });
    await fetchSchedules({ skipCache: true });
  }, [fetchSchedules]);

  const handleEventTimeChange = async (schedule: Schedule, startAt: string, endAt: string) => {
    // 마스킹된 표시용 객체가 넘어올 수 있으므로 항상 원본으로 시간 변경을 처리한다.
    const original = schedules.find((s) => s.id === schedule.id) ?? schedule;
    if (isRecurringSchedule(original)) {
      setPendingTimeChange({ schedule: original, startAt, endAt });
      return;
    }

    await executeEventTimeChange(original, startAt, endAt);
  };

  const handleDelete = async (id: string, scope?: ScheduleRecurrenceActionScope) => {
    const res = await fetch("/api/schedules/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        scheduleId: id,
        scope,
      }),
    });
    const result = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("일정 삭제 실패:", result?.error ?? "알 수 없는 오류");
      toast.error("일정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }

    toast.success(
      (result?.count ?? 1) > 1
        ? `반복 일정 ${result.count}건이 삭제되었습니다.`
        : "일정이 삭제되었습니다."
    );
    if (result?.warning) toast.warning(result.warning);
    sendLog("DELETE_SCHEDULE", "일정 삭제", { resource: "schedule", resource_id: id });
    await fetchSchedules({ skipCache: true });
    return true;
  };

  const handleNotificationSettingChange = (
    key: keyof ScheduleNotificationSettingsForm,
    value: string
  ) => {
    setNotificationSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveNotificationSettings = async () => {
    setNotificationSaving(true);
    try {
      const res = await fetch("/api/settings/slack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationSettings),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "알림 설정 저장에 실패했습니다.");
      }

      toast.success("알림 설정을 저장했습니다.");
      setNotificationOpen(false);
      await fetchNotificationSettings();
    } catch (e) {
      console.error("알림 설정 저장 실패:", e instanceof Error ? e.message : String(e));
      toast.error("알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setNotificationSaving(false);
  };

  return (
    <PageShell>
      <CalendarHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onDateChange={setCurrentDate}
        onViewModeChange={setViewMode}
        onAddSchedule={() => openNewDialog()}
        onOpenNotificationSettings={() => setNotificationOpen(true)}
      />

      <EmployeeFilter
        employees={employees}
        filterMode={filterMode}
        selectedEmployeeIds={selectedEmployeeIds}
        schedulesCount={schedules.length}
        unassignedCount={unassignedCount}
        employeeScheduleCounts={employeeScheduleCounts}
        onFilterChange={handleFilterChange}
      />

      {loading ? (
        <LoadingState
          title="일정을 불러오는 중입니다."
          description="현재 보기 범위와 담당자 정보를 함께 준비하고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="일정 데이터를 다시 불러오지 못했습니다."
          onRetry={() => void fetchSchedules({ skipCache: true })}
        />
      ) : filteredSchedules.length === 0 ? (
        <EmptyState
          title="현재 조건에 맞는 일정이 없습니다."
          description="담당자 필터를 바꾸거나 새 일정을 등록해 보세요."
          action={
            <Button size="sm" onClick={() => openNewDialog()}>
              일정 등록
            </Button>
          }
        />
      ) : (
        <>
          {viewMode === "month" && (
            <CalendarMonthView
              currentDate={currentDate}
              schedules={displaySchedules}
              onDateClick={handleDateClick}
              onEventClick={openEditDialog}
            />
          )}
          {viewMode === "week" && (
            <CalendarWeekView
              currentDate={currentDate}
              schedules={displaySchedules}
              onTimeClick={handleTimeClick}
              onEventClick={openEditDialog}
              onEventTimeChange={handleEventTimeChange}
            />
          )}
          {viewMode === "day" && (
            <CalendarDayView
              currentDate={currentDate}
              schedules={displaySchedules}
              onTimeClick={handleTimeClick}
              onEventClick={openEditDialog}
              onEventTimeChange={handleEventTimeChange}
            />
          )}
        </>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schedule={editingSchedule}
        employees={employees}
        projects={projects}
        customers={customers}
        leads={leads}
        categories={categories}
        currentEmployeeId={currentEmployeeId}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        defaultAllDay={defaultAllDay}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <ScheduleRecurrenceScopeDialog
        open={Boolean(pendingTimeChange)}
        onOpenChange={(open) => {
          if (!open) setPendingTimeChange(null);
        }}
        action="update"
        onSelect={async (scope) => {
          const target = pendingTimeChange;
          if (!target) return;
          setPendingTimeChange(null);
          await executeEventTimeChange(target.schedule, target.startAt, target.endAt, scope);
        }}
      />

      <Dialog open={notificationOpen} onOpenChange={setNotificationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>알림설정</DialogTitle>
            <DialogDescription>
              매일 지정한 시각에 Slack 채널로 오늘 일정을 공유합니다. 일정이 없으면 없다고 발송합니다.
            </DialogDescription>
          </DialogHeader>

          {notificationLoading ? (
            <div className="py-6 text-sm text-muted-foreground">설정을 불러오는 중입니다.</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schedule_time">발송 시간</Label>
                <Input
                  id="schedule_time"
                  type="time"
                  value={notificationSettings.schedule_time}
                  onChange={(e) => handleNotificationSettingChange("schedule_time", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule_channel">Slack 채널</Label>
                <Input
                  id="schedule_channel"
                  value={notificationSettings.schedule_channel}
                  onChange={(e) => handleNotificationSettingChange("schedule_channel", e.target.value)}
                  placeholder="#random 또는 C0123456789"
                />
              </div>

              <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Slack Bot Token은 설정 화면의 Slack 항목을 그대로 사용합니다. 현재 기본값은 오전 7시, `#random`
                입니다.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={handleSaveNotificationSettings} disabled={notificationLoading || notificationSaving}>
              {notificationSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

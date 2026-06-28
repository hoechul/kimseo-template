import { NextRequest, NextResponse } from "next/server";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getAttendeeEmails,
  getGoogleCalendarClient,
  getGoogleCalendarId,
  updateGoogleCalendarEvent,
} from "@/lib/google-calendar";
import { getGoogleOAuthToken } from "@/lib/google-token";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toKstDateString } from "@/lib/date";

type RecurrenceType = "none" | "daily" | "weekly" | "monthly";
type ScheduleMutationScope = "single" | "following" | "all";

type ScheduleInput = {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category?: string;
  location?: string | null;
  project_id?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  created_by?: string;
  recurrence_type?: RecurrenceType;
  recurrence_end_date?: string | null;
  recurrence_group_id?: string | null;
};

type ScheduleSeriesRow = {
  id: string;
  google_event_id: string | null;
  start_at: string;
  end_at: string;
  recurrence_type: RecurrenceType;
  recurrence_end_date: string | null;
  recurrence_group_id: string | null;
};

const GOOGLE_UPDATE_WARNING = "일정은 수정되었지만 Google Calendar 동기화에 일부 실패했습니다. Google 계정을 다시 연결해주세요.";
const GOOGLE_DELETE_WARNING = "일정은 삭제되었지만 Google Calendar에서는 일부 삭제되지 않았습니다. Google 계정을 다시 연결해주세요.";

function hasValidScheduleRange(startAt: string, endAt: string) {
  return new Date(endAt).getTime() > new Date(startAt).getTime();
}

function normalizeScheduleMutationScope(value: unknown): ScheduleMutationScope {
  if (value === "following" || value === "all") return value;
  return "single";
}

function isRecurringSeries(schedule: Pick<ScheduleSeriesRow, "recurrence_group_id" | "recurrence_type">) {
  return schedule.recurrence_type !== "none" && Boolean(schedule.recurrence_group_id);
}

function shiftIso(isoString: string, deltaMs: number) {
  return new Date(new Date(isoString).getTime() + deltaMs).toISOString();
}

function getSeriesEndDate(startAtValues: string[]) {
  const lastStartAt = startAtValues[startAtValues.length - 1];
  return lastStartAt ? toKstDateString(new Date(lastStartAt)) : null;
}

function buildMutableScheduleFields(
  schedule: ScheduleInput,
  overrides?: Partial<Pick<ScheduleInput, "start_at" | "end_at" | "all_day" | "recurrence_type" | "recurrence_end_date" | "recurrence_group_id">>
) {
  return {
    title: schedule.title,
    description: schedule.description ?? null,
    start_at: overrides?.start_at ?? schedule.start_at,
    end_at: overrides?.end_at ?? schedule.end_at,
    all_day: overrides?.all_day ?? schedule.all_day,
    category: schedule.category ?? "other",
    location: schedule.location ?? null,
    project_id: schedule.project_id ?? null,
    customer_id: schedule.customer_id ?? null,
    lead_id: schedule.lead_id ?? null,
    recurrence_type: overrides?.recurrence_type ?? schedule.recurrence_type ?? "none",
    recurrence_end_date: overrides?.recurrence_end_date ?? schedule.recurrence_end_date ?? null,
    recurrence_group_id: overrides?.recurrence_group_id ?? schedule.recurrence_group_id ?? null,
    sync_source: "local" as const,
  };
}

function generateRecurrenceDates(startDate: Date, type: string, endDateStr: string): Date[] {
  const dates: Date[] = [];
  const endDate = new Date(`${endDateStr}T23:59:59`);
  const maxInstances = 365;
  const current = new Date(startDate);

  while (current <= endDate && dates.length < maxInstances) {
    dates.push(new Date(current));

    if (type === "daily") current.setDate(current.getDate() + 1);
    else if (type === "weekly") current.setDate(current.getDate() + 7);
    else if (type === "monthly") {
      const day = startDate.getDate();
      current.setMonth(current.getMonth() + 1);
      const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      if (current.getDate() !== day) {
        current.setDate(Math.min(day, lastDay));
      }
    }
  }

  return dates;
}

async function getCurrentEmployeeId(authUid: string) {
  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("employees")
    .select("id")
    .eq("auth_uid", authUid)
    .maybeSingle();

  if (!employee?.id) {
    throw new Error("현재 로그인 사용자와 연결된 직원 정보를 찾지 못했습니다.");
  }

  return employee.id as string;
}

async function replaceAttendees(scheduleId: string, attendeeIds: string[]) {
  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("schedule_attendees")
    .delete()
    .eq("schedule_id", scheduleId);

  if (deleteError) {
    throw new Error(`참석자 삭제 실패: ${deleteError.message}`);
  }

  if (attendeeIds.length === 0) return;

  const { error: insertError } = await admin.from("schedule_attendees").insert(
    attendeeIds.map((employee_id) => ({
      schedule_id: scheduleId,
      employee_id,
    }))
  );

  if (insertError) {
    throw new Error(`참석자 저장 실패: ${insertError.message}`);
  }
}

async function fetchSeriesRows(groupId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("schedules")
    .select("id, google_event_id, start_at, end_at, recurrence_type, recurrence_end_date, recurrence_group_id")
    .eq("recurrence_group_id", groupId)
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ScheduleSeriesRow[];
}

export async function POST(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const schedule = (body?.schedule ?? null) as ScheduleInput | null;
    const scheduleId = body?.scheduleId ? String(body.scheduleId) : null;
    const attendeeIds: string[] = Array.isArray(body?.attendeeIds)
      ? body.attendeeIds.map((value: unknown) => String(value))
      : [];
    const recurrence = body?.recurrence as { type?: string; endDate?: string | null } | undefined;
    const addGoogleMeet = Boolean(body?.addGoogleMeet);
    const requestedScope = normalizeScheduleMutationScope(body?.scope);

    const admin = createAdminClient();
    const employeeId = await getCurrentEmployeeId(user.id);
    const token = await getGoogleOAuthToken(admin, user.id);
    const calendarId = getGoogleCalendarId();
    const attendeeEmails = await getAttendeeEmails(attendeeIds);
    let calendar: Awaited<ReturnType<typeof getGoogleCalendarClient>> | null = null;
    let googleAuthWarning: string | null = null;
    if (token) {
      try {
        calendar = await getGoogleCalendarClient(token);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("Google Calendar 클라이언트 초기화 실패 (로컬 저장으로 진행):", errMsg);
        googleAuthWarning = "Google Calendar 동기화에 실패했습니다. Google 계정을 다시 연결해주세요.";
      }
    }

    if (action === "create") {
      if (!schedule || !hasValidScheduleRange(schedule.start_at, schedule.end_at)) {
        throw new Error("잘못된 일정 시간 범위입니다.");
      }

      const shouldAddGoogleMeet = addGoogleMeet || schedule.category === "meeting";

      if (recurrence?.type && recurrence.type !== "none" && recurrence.endDate) {
        const groupId = crypto.randomUUID();
        const durationMs = new Date(schedule.end_at).getTime() - new Date(schedule.start_at).getTime();
        const rows = [];
        const createdGoogleEvents: { eventId: string }[] = [];

        for (const date of generateRecurrenceDates(new Date(schedule.start_at), recurrence.type, recurrence.endDate)) {
          const startAt = date.toISOString();
          const endAt = new Date(date.getTime() + durationMs).toISOString();
          const baseRow = {
            ...buildMutableScheduleFields(schedule, {
              start_at: startAt,
              end_at: endAt,
              recurrence_type: recurrence.type as RecurrenceType,
              recurrence_end_date: recurrence.endDate,
              recurrence_group_id: groupId,
            }),
            created_by: schedule.created_by || employeeId,
          };

          if (calendar && !googleAuthWarning) {
            try {
              const googleMeta = await createGoogleCalendarEvent({
                calendar,
                calendarId,
                schedule: baseRow,
                attendeeEmails,
                addGoogleMeet: shouldAddGoogleMeet,
              });
              if (googleMeta.google_event_id) {
                createdGoogleEvents.push({ eventId: googleMeta.google_event_id });
              }
              rows.push({ ...baseRow, ...googleMeta });
            } catch (err) {
              console.error("Google Calendar 반복 이벤트 생성 실패 (로컬 저장으로 진행):", err);
              googleAuthWarning = "일정은 저장되었지만 Google Calendar 동기화에 실패했습니다. Google 계정을 다시 연결해주세요.";
              rows.push(baseRow);
            }
          } else {
            rows.push(baseRow);
          }
        }

        const { data: inserted, error: insertError } = await admin
          .from("schedules")
          .insert(rows)
          .select("id");

        if (insertError || !inserted) {
          if (calendar) {
            for (const event of createdGoogleEvents) {
              try {
                await deleteGoogleCalendarEvent({ calendar, calendarId, eventId: event.eventId });
              } catch {}
            }
          }
          throw new Error(insertError?.message ?? "반복 일정 저장 실패");
        }

        if (attendeeIds.length > 0) {
          const attendeeRows = inserted.flatMap((item) =>
            attendeeIds.map((employee_id) => ({
              schedule_id: item.id,
              employee_id,
            }))
          );
          const { error: attendeeError } = await admin.from("schedule_attendees").insert(attendeeRows);
          if (attendeeError) {
            throw new Error(`참석자 저장 실패: ${attendeeError.message}`);
          }
        }

        return NextResponse.json({
          ok: true,
          count: inserted.length,
          ids: inserted.map((item) => item.id),
          warning: googleAuthWarning,
        });
      }

      const baseRow = {
        ...buildMutableScheduleFields(schedule, {
          recurrence_type: "none",
          recurrence_end_date: null,
          recurrence_group_id: null,
        }),
        created_by: schedule.created_by || employeeId,
      };

      let row: typeof baseRow & { google_event_id?: string | null } = baseRow;
      if (calendar) {
        try {
          const googleMeta = await createGoogleCalendarEvent({
            calendar,
            calendarId,
            schedule: baseRow,
            attendeeEmails,
            addGoogleMeet: shouldAddGoogleMeet,
          });
          row = { ...baseRow, ...googleMeta };
        } catch (err) {
          console.error("Google Calendar 이벤트 생성 실패 (로컬 저장으로 진행):", err);
          googleAuthWarning = "일정은 저장되었지만 Google Calendar 동기화에 실패했습니다. Google 계정을 다시 연결해주세요.";
        }
      }

      const { data: inserted, error: insertError } = await admin
        .from("schedules")
        .insert(row)
        .select("id")
        .single();

      if (insertError || !inserted) {
        if (calendar && row.google_event_id) {
          try {
            await deleteGoogleCalendarEvent({ calendar, calendarId, eventId: row.google_event_id });
          } catch {}
        }
        throw new Error(insertError?.message ?? "일정 저장 실패");
      }

      await replaceAttendees(inserted.id as string, attendeeIds);
      return NextResponse.json({ ok: true, id: inserted.id, count: 1, warning: googleAuthWarning });
    }

    if (action === "update") {
      if (!scheduleId || !schedule || !hasValidScheduleRange(schedule.start_at, schedule.end_at)) {
        throw new Error("수정 대상 일정이 올바르지 않습니다.");
      }

      const { data: existing, error: existingError } = await admin
        .from("schedules")
        .select("id, google_event_id, start_at, end_at, recurrence_type, recurrence_end_date, recurrence_group_id")
        .eq("id", scheduleId)
        .single();

      if (existingError || !existing) {
        throw new Error(existingError?.message ?? "기존 일정을 찾지 못했습니다.");
      }

      const normalizedExisting = existing as ScheduleSeriesRow;
      const isRecurring = isRecurringSeries(normalizedExisting);
      const scope = isRecurring ? requestedScope : "single";

      if (scope === "single") {
        const updateRow = buildMutableScheduleFields(schedule, {
          recurrence_type: normalizedExisting.recurrence_type,
          recurrence_end_date: normalizedExisting.recurrence_end_date,
          recurrence_group_id: normalizedExisting.recurrence_group_id,
        });

        let googleMeta: Record<string, unknown> = {};
        let warning = googleAuthWarning;
        if (calendar) {
          try {
            googleMeta = normalizedExisting.google_event_id
              ? await updateGoogleCalendarEvent({
                  calendar,
                  calendarId,
                  eventId: String(normalizedExisting.google_event_id),
                  schedule: updateRow,
                  attendeeEmails,
                })
              : await createGoogleCalendarEvent({
                  calendar,
                  calendarId,
                  schedule: updateRow,
                  attendeeEmails,
                });
          } catch (err) {
            console.error("Google Calendar 이벤트 수정 실패 (로컬 저장으로 진행):", err);
            warning = GOOGLE_UPDATE_WARNING;
          }
        } else if (googleAuthWarning) {
          warning = GOOGLE_UPDATE_WARNING;
        }

        const { error: updateError } = await admin
          .from("schedules")
          .update({ ...updateRow, ...googleMeta })
          .eq("id", scheduleId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        await replaceAttendees(scheduleId, attendeeIds);
        return NextResponse.json({ ok: true, id: scheduleId, count: 1, warning });
      }

      const seriesRows = await fetchSeriesRows(String(normalizedExisting.recurrence_group_id));
      if (seriesRows.length === 0) {
        throw new Error("반복 일정 묶음을 찾지 못했습니다.");
      }

      const existingStartMs = new Date(normalizedExisting.start_at).getTime();
      const earlierRows = seriesRows.filter((row) => new Date(row.start_at).getTime() < existingStartMs);
      const targetRows = requestedScope === "all" || earlierRows.length === 0
        ? seriesRows
        : seriesRows.filter((row) => new Date(row.start_at).getTime() >= existingStartMs);
      const nextGroupId = requestedScope === "following" && earlierRows.length > 0
        ? crypto.randomUUID()
        : String(normalizedExisting.recurrence_group_id);
      const startDeltaMs = new Date(schedule.start_at).getTime() - new Date(normalizedExisting.start_at).getTime();
      const endDeltaMs = new Date(schedule.end_at).getTime() - new Date(normalizedExisting.end_at).getTime();
      const updatedStartAtValues = targetRows.map((row) => shiftIso(row.start_at, startDeltaMs));
      const targetRecurrenceEndDate = getSeriesEndDate(updatedStartAtValues);
      const earlierRecurrenceEndDate = getSeriesEndDate(earlierRows.map((row) => row.start_at));

      let warning = googleAuthWarning ? GOOGLE_UPDATE_WARNING : null;

      for (const [index, row] of targetRows.entries()) {
        const updateRow = buildMutableScheduleFields(schedule, {
          start_at: updatedStartAtValues[index],
          end_at: shiftIso(row.end_at, endDeltaMs),
          recurrence_type: normalizedExisting.recurrence_type,
          recurrence_end_date: targetRecurrenceEndDate,
          recurrence_group_id: nextGroupId,
        });

        let googleMeta: Record<string, unknown> = {};
        if (calendar) {
          try {
            googleMeta = row.google_event_id
              ? await updateGoogleCalendarEvent({
                  calendar,
                  calendarId,
                  eventId: String(row.google_event_id),
                  schedule: updateRow,
                  attendeeEmails,
                })
              : await createGoogleCalendarEvent({
                  calendar,
                  calendarId,
                  schedule: updateRow,
                  attendeeEmails,
                });
          } catch (err) {
            console.error("Google Calendar 반복 일정 수정 실패 (로컬 저장으로 진행):", err);
            warning = GOOGLE_UPDATE_WARNING;
          }
        }

        const { error: updateError } = await admin
          .from("schedules")
          .update({ ...updateRow, ...googleMeta })
          .eq("id", row.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        await replaceAttendees(row.id, attendeeIds);
      }

      if (requestedScope === "following" && earlierRows.length > 0) {
        const { error: earlierUpdateError } = await admin
          .from("schedules")
          .update({ recurrence_end_date: earlierRecurrenceEndDate })
          .in("id", earlierRows.map((row) => row.id));

        if (earlierUpdateError) {
          throw new Error(earlierUpdateError.message);
        }
      }

      return NextResponse.json({
        ok: true,
        count: targetRows.length,
        ids: targetRows.map((row) => row.id),
        warning,
      });
    }

    if (action === "delete") {
      if (!scheduleId) {
        throw new Error("삭제 대상 일정이 없습니다.");
      }

      const { data: existing, error: existingError } = await admin
        .from("schedules")
        .select("id, google_event_id, start_at, end_at, recurrence_type, recurrence_end_date, recurrence_group_id")
        .eq("id", scheduleId)
        .single();

      if (existingError || !existing) {
        throw new Error(existingError?.message ?? "기존 일정을 찾지 못했습니다.");
      }

      const normalizedExisting = existing as ScheduleSeriesRow;
      const isRecurring = isRecurringSeries(normalizedExisting);
      const scope = isRecurring ? requestedScope : "single";

      if (scope === "single") {
        let warning = null as string | null;
        if (normalizedExisting.google_event_id) {
          if (calendar) {
            try {
              await deleteGoogleCalendarEvent({
                calendar,
                calendarId,
                eventId: String(normalizedExisting.google_event_id),
              });
            } catch (err) {
              console.error("Google Calendar 이벤트 삭제 실패 (로컬 삭제로 진행):", err);
              warning = GOOGLE_DELETE_WARNING;
            }
          } else if (googleAuthWarning) {
            warning = GOOGLE_DELETE_WARNING;
          }
        }

        const { error: deleteError } = await admin
          .from("schedules")
          .delete()
          .eq("id", scheduleId);

        if (deleteError) {
          throw new Error(deleteError.message);
        }

        return NextResponse.json({ ok: true, id: scheduleId, count: 1, warning });
      }

      const seriesRows = await fetchSeriesRows(String(normalizedExisting.recurrence_group_id));
      if (seriesRows.length === 0) {
        throw new Error("반복 일정 묶음을 찾지 못했습니다.");
      }

      const existingStartMs = new Date(normalizedExisting.start_at).getTime();
      const earlierRows = seriesRows.filter((row) => new Date(row.start_at).getTime() < existingStartMs);
      const targetRows = requestedScope === "all" || earlierRows.length === 0
        ? seriesRows
        : seriesRows.filter((row) => new Date(row.start_at).getTime() >= existingStartMs);
      const earlierRecurrenceEndDate = getSeriesEndDate(earlierRows.map((row) => row.start_at));

      let warning = !calendar && googleAuthWarning && targetRows.some((row) => row.google_event_id)
        ? GOOGLE_DELETE_WARNING
        : null;

      if (calendar) {
        for (const row of targetRows) {
          if (!row.google_event_id) continue;
          try {
            await deleteGoogleCalendarEvent({
              calendar,
              calendarId,
              eventId: String(row.google_event_id),
            });
          } catch (err) {
            console.error("Google Calendar 반복 일정 삭제 실패 (로컬 삭제로 진행):", err);
            warning = GOOGLE_DELETE_WARNING;
          }
        }
      }

      const targetIds = targetRows.map((row) => row.id);
      const { error: deleteError } = await admin
        .from("schedules")
        .delete()
        .in("id", targetIds);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (requestedScope === "following" && earlierRows.length > 0) {
        const { error: earlierUpdateError } = await admin
          .from("schedules")
          .update({ recurrence_end_date: earlierRecurrenceEndDate })
          .in("id", earlierRows.map((row) => row.id));

        if (earlierUpdateError) {
          throw new Error(earlierUpdateError.message);
        }
      }

      return NextResponse.json({
        ok: true,
        count: targetIds.length,
        ids: targetIds,
        warning,
      });
    }

    throw new Error("지원하지 않는 일정 작업입니다.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "일정 처리 실패";
    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes("insufficient authentication scopes")
      || normalizedMessage.includes("insufficient_permissions")
    ) {
      return NextResponse.json(
        { error: "Google Calendar 권한이 없는 토큰입니다. Google 계정을 다시 연결해 calendar 권한을 승인해주세요." },
        { status: 400 }
      );
    }

    if (normalizedMessage.includes("invalid_client")) {
      return NextResponse.json(
        { error: "Google OAuth 인증 정보가 유효하지 않습니다. Google 계정을 다시 연결해주세요." },
        { status: 400 }
      );
    }

    if (
      normalizedMessage.includes("invalid_grant")
      || normalizedMessage.includes("token has been expired")
      || normalizedMessage.includes("token has been revoked")
    ) {
      return NextResponse.json(
        { error: "Google 인증이 만료되었습니다. Google 계정을 다시 연결해주세요." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

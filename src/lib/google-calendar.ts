import { calendar_v3, google } from "googleapis";
import { getOAuthClient } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_SYNC_WINDOW_PAST_DAYS = 90;
const DEFAULT_SYNC_WINDOW_FUTURE_DAYS = 365;
const API_TIMEOUT_MS = 30_000;

type GoogleToken = {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  onTokenRefreshed?: (newAccessToken: string, newExpiry: number) => void | Promise<void>;
};

type SyncState = {
  calendar_id: string;
  sync_token: string | null;
};

function dayToKstStart(date: string) {
  return `${date}T00:00:00+09:00`;
}

function dayToKstEndExclusive(date: string) {
  return `${date}T00:00:00+09:00`;
}

function getEventDateTime(dateTime?: string | null, date?: string | null) {
  if (dateTime) return dateTime;
  if (date) return dayToKstStart(date);
  return null;
}

function getEventEndDateTime(dateTime?: string | null, date?: string | null) {
  if (dateTime) return dateTime;
  if (date) return dayToKstEndExclusive(date);
  return null;
}

export function getGoogleCalendarId() {
  return process.env.GOOGLE_CALENDAR_SYNC_CALENDAR_ID ?? "";
}

export function getGoogleCalendarWebhookUrl() {
  return process.env.GOOGLE_CALENDAR_WEBHOOK_URL
    ?? (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google-calendar/webhook`
      : null);
}

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000; // 만료 5분 전부터 선제 갱신

export async function getGoogleCalendarClient(token: GoogleToken) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiryDate,
  });

  // 토큰 갱신 저장은 프로액티브 갱신에서 await로 처리하므로
  // 이벤트 핸들러에서는 프로액티브 갱신을 건너뛴 경우(API 호출 중 자동 갱신)만 저장
  let proactiveRefreshDone = false;

  client.on("tokens", (tokens) => {
    if (proactiveRefreshDone) return; // 이미 저장 완료
    if (tokens.access_token && token.onTokenRefreshed) {
      token
        .onTokenRefreshed(
          tokens.access_token,
          tokens.expiry_date ?? Date.now() + 3600_000
        )
        ?.catch((err: unknown) => {
          console.error("[GoogleCalendar] 자동 토큰 갱신 저장 실패:", err);
        });
    }
  });

  if (!token.expiryDate || isNaN(token.expiryDate) || token.expiryDate < Date.now() + TOKEN_REFRESH_MARGIN_MS) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      proactiveRefreshDone = true;
      if (credentials.access_token && token.onTokenRefreshed) {
        await token.onTokenRefreshed(
          credentials.access_token,
          credentials.expiry_date ?? Date.now() + 3600_000
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const lower = errMsg.toLowerCase();
      if (lower.includes("invalid_client")) {
        throw new Error("invalid_client: Google OAuth 클라이언트 인증 정보가 유효하지 않습니다. 환경변수(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)를 확인하거나 Google 계정을 다시 연결해주세요.");
      }
      if (lower.includes("invalid_grant") || lower.includes("token has been expired") || lower.includes("token has been revoked")) {
        throw new Error("insufficient_permissions: Google 인증이 만료되었습니다. Google 계정을 다시 연결해주세요.");
      }
      throw new Error(`Google Calendar 토큰 갱신 실패: ${errMsg}`);
    }
  }

  return google.calendar({
    version: "v3",
    auth: client,
    timeout: API_TIMEOUT_MS,
  });
}

export async function resolveSyncEmployeeId(preferredEmail?: string | null) {
  const admin = createAdminClient();
  const configuredEmployeeId = process.env.GOOGLE_CALENDAR_SYNC_EMPLOYEE_ID;
  if (configuredEmployeeId) {
    return configuredEmployeeId;
  }

  if (preferredEmail) {
    const { data: employee } = await admin
      .from("employees")
      .select("id")
      .eq("email", preferredEmail)
      .limit(1)
      .single();

    if (employee?.id) return employee.id as string;
  }

  const { data: adminEmployee } = await admin
    .from("employees")
    .select("id")
    .eq("employee_type", "관리자")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .single();

  if (adminEmployee?.id) return adminEmployee.id as string;

  throw new Error("Google Calendar 동기화에 사용할 직원 계정을 찾지 못했습니다.");
}

function mapGoogleEventToScheduleRow(
  calendarId: string,
  employeeId: string,
  event: calendar_v3.Schema$Event
) {
  const startAt = getEventDateTime(event.start?.dateTime, event.start?.date);
  const endAt = getEventEndDateTime(event.end?.dateTime, event.end?.date);
  if (!event.id || !startAt || !endAt) {
    return null;
  }

  return {
    title: event.summary?.trim() || "(제목 없음)",
    description: event.description?.trim() || null,
    start_at: startAt,
    end_at: endAt,
    all_day: Boolean(event.start?.date && !event.start?.dateTime),
    category: "other",
    location: event.location?.trim() || null,
    google_meet_link: event.hangoutLink?.trim() || null,
    project_id: null,
    recurrence_type: "none",
    recurrence_end_date: null,
    recurrence_group_id: null,
    created_by: employeeId,
    google_calendar_id: calendarId,
    google_event_id: event.id,
    google_event_status: event.status ?? "confirmed",
    google_etag: event.etag ?? null,
    google_updated_at: event.updated ?? null,
    sync_source: "google",
  };
}

async function deleteCancelledEvent(calendarId: string, eventId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("schedules")
    .delete()
    .eq("google_calendar_id", calendarId)
    .eq("google_event_id", eventId);

  if (error) {
    throw new Error(`취소된 Google 일정 삭제 실패: ${error.message}`);
  }
}

async function upsertGoogleEvent(
  calendarId: string,
  employeeId: string,
  event: calendar_v3.Schema$Event
): Promise<{ upserted: boolean; newId: string | null }> {
  const row = mapGoogleEventToScheduleRow(calendarId, employeeId, event);
  if (!row) return { upserted: false, newId: null };

  const admin = createAdminClient();

  // 기존 일정이 있는지 확인
  const { data: existing } = await admin
    .from("schedules")
    .select("id")
    .eq("google_calendar_id", calendarId)
    .eq("google_event_id", event.id!)
    .maybeSingle();

  if (existing) {
    // 기존 일정: Google에서 변경되는 필드만 업데이트 (category, project_id, recurrence 등 보존)
    const { error } = await admin
      .from("schedules")
      .update({
        title: row.title,
        description: row.description,
        start_at: row.start_at,
        end_at: row.end_at,
        all_day: row.all_day,
        location: row.location,
        google_meet_link: row.google_meet_link,
        google_event_status: row.google_event_status,
        google_etag: row.google_etag,
        google_updated_at: row.google_updated_at,
        sync_source: row.sync_source,
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Google 일정 업데이트 실패: ${error.message}`);
    }
    return { upserted: true, newId: null };
  } else {
    // 새 일정: 전체 필드로 삽입
    const { data, error } = await admin
      .from("schedules")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      throw new Error(`Google 일정 저장 실패: ${error.message}`);
    }
    return { upserted: true, newId: data?.id ?? null };
  }
}

async function runSingleSyncPass(params: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  employeeId: string;
  syncToken?: string | null;
}) {
  let pageToken: string | undefined;
  let imported = 0;
  let deleted = 0;
  let nextSyncToken: string | null = null;
  const newScheduleIds: string[] = [];

  do {
    const response = await params.calendar.events.list({
      calendarId: params.calendarId,
      maxResults: 250,
      showDeleted: true,
      singleEvents: true,
      syncToken: params.syncToken ?? undefined,
      pageToken,
      ...(params.syncToken
        ? {}
        : {
            timeMin: new Date(Date.now() - DEFAULT_SYNC_WINDOW_PAST_DAYS * 86400_000).toISOString(),
            timeMax: new Date(Date.now() + DEFAULT_SYNC_WINDOW_FUTURE_DAYS * 86400_000).toISOString(),
          }),
    });

    for (const event of response.data.items ?? []) {
      if (!event.id) continue;

      if (event.status === "cancelled") {
        await deleteCancelledEvent(params.calendarId, event.id);
        deleted += 1;
        continue;
      }

      const result = await upsertGoogleEvent(params.calendarId, params.employeeId, event);
      if (result.upserted) {
        imported += 1;
      }
      if (result.newId) {
        newScheduleIds.push(result.newId);
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
    nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { imported, deleted, nextSyncToken, newScheduleIds };
}

export async function syncGoogleCalendarEvents(params: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  employeeId: string;
  state?: SyncState | null;
}) {
  try {
    return await runSingleSyncPass({
      calendar: params.calendar,
      calendarId: params.calendarId,
      employeeId: params.employeeId,
      syncToken: params.state?.sync_token ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Sync token is no longer valid")) {
      throw error;
    }

    console.warn(
      "[GoogleCalendar] Sync token 만료, 전체 재동기화 실행:",
      params.calendarId
    );

    return runSingleSyncPass({
      calendar: params.calendar,
      calendarId: params.calendarId,
      employeeId: params.employeeId,
      syncToken: null,
    });
  }
}

export async function registerGoogleCalendarWatch(params: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
}) {
  const address = getGoogleCalendarWebhookUrl();
  if (!address) {
    throw new Error("GOOGLE_CALENDAR_WEBHOOK_URL 또는 NEXT_PUBLIC_APP_URL 환경변수가 필요합니다.");
  }

  const channelId = crypto.randomUUID();
  const channelToken = crypto.randomUUID();

  const response = await params.calendar.events.watch({
    calendarId: params.calendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address,
      token: channelToken,
    },
  });

  return {
    channelId,
    channelToken,
    resourceId: response.data.resourceId ?? null,
    expiration: response.data.expiration ? new Date(Number(response.data.expiration)).toISOString() : null,
  };
}

type LocalScheduleForGoogle = {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string | null;
};

function formatGoogleAllDayDate(isoString: string) {
  return new Date(isoString).toISOString().slice(0, 10);
}

function addDaysToDateString(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildGoogleEvent(
  schedule: LocalScheduleForGoogle,
  attendeeEmails: string[] = [],
  addGoogleMeet = false,
): calendar_v3.Schema$Event {
  return {
    summary: schedule.title,
    description: schedule.description ?? undefined,
    location: schedule.location ?? undefined,
    attendees: attendeeEmails.map((email) => ({ email })),
    ...(addGoogleMeet
      ? {
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
    ...(schedule.all_day
      ? {
          start: { date: formatGoogleAllDayDate(schedule.start_at) },
          end: { date: addDaysToDateString(formatGoogleAllDayDate(schedule.end_at), 1) },
        }
      : {
          start: { dateTime: schedule.start_at },
          end: { dateTime: schedule.end_at },
        }),
  };
}

export async function getAttendeeEmails(employeeIds: string[]) {
  if (employeeIds.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employees")
    .select("email")
    .in("id", employeeIds);

  if (error) {
    throw new Error(`일정 참석자 이메일 조회 실패: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.email)
    .filter((email): email is string => Boolean(email));
}

export async function createGoogleCalendarEvent(params: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  schedule: LocalScheduleForGoogle;
  attendeeEmails?: string[];
  addGoogleMeet?: boolean;
}) {
  const addMeet = params.addGoogleMeet ?? false;
  const response = await params.calendar.events.insert({
    calendarId: params.calendarId,
    requestBody: buildGoogleEvent(params.schedule, params.attendeeEmails, addMeet),
    ...(addMeet ? { conferenceDataVersion: 1 } : {}),
  });

  return {
    google_event_id: response.data.id ?? null,
    google_event_status: response.data.status ?? "confirmed",
    google_etag: response.data.etag ?? null,
    google_updated_at: response.data.updated ?? null,
    google_calendar_id: params.calendarId,
    google_meet_link: response.data.hangoutLink ?? null,
    sync_source: "local" as const,
  };
}

export async function updateGoogleCalendarEvent(params: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  eventId: string;
  schedule: LocalScheduleForGoogle;
  attendeeEmails?: string[];
}) {
  const response = await params.calendar.events.update({
    calendarId: params.calendarId,
    eventId: params.eventId,
    requestBody: buildGoogleEvent(params.schedule, params.attendeeEmails),
  });

  return {
    google_event_id: response.data.id ?? params.eventId,
    google_event_status: response.data.status ?? "confirmed",
    google_etag: response.data.etag ?? null,
    google_updated_at: response.data.updated ?? null,
    google_calendar_id: params.calendarId,
    sync_source: "local" as const,
  };
}

export async function deleteGoogleCalendarEvent(params: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  eventId: string;
}) {
  await params.calendar.events.delete({
    calendarId: params.calendarId,
    eventId: params.eventId,
  });
}

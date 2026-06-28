import { NextRequest, NextResponse } from "next/server";

import { validateApiKey } from "@/lib/api-key";
import { logError, logInfo } from "@/lib/logger";
import { runMeetingAiMatch } from "@/lib/meeting-ai-match";
import { sendMeetingSummarySlackMessage } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/admin";

interface MeetingApiInput {
  title?: string;
  project_id?: string | null;
  project_number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  transcript?: string;
  summary?: string;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
}

interface MeetingApiSuccess {
  success: true;
  data: {
    id: string;
    title: string;
    project_id: string | null;
    customer_id: string | null;
    transcript: string;
    summary: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    created_at: string;
    updated_at: string;
    projects?: { project_number: string; name: string } | null;
    customers?: { id: string; name: string } | null;
  };
}

interface MeetingApiError {
  error: string;
  input: unknown;
}

type MeetingApiResult = MeetingApiSuccess | MeetingApiError;

function isUtcOffsetDateTime(text: string) {
  return /(?:[Zz]|[+-]00:?(?:00)?)$/.test(text);
}

function reinterpretUtcWallClockAsKst(text: string, fieldName: string) {
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(\.(\d{1,6}))?)?(?:[Zz]|[+-]00:?(?:00)?)$/
  );

  if (!match) {
    throw new Error(`${fieldName} must be a valid ISO datetime`);
  }

  const [, year, month, day, hour, minute, second = "00", , fractional = ""] = match;
  const milliseconds = Number(fractional.padEnd(3, "0").slice(0, 3) || "0");

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 9,
      Number(minute),
      Number(second),
      milliseconds
    )
  ).toISOString();
}

function parseDateTime(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim();

  // Zapier가 UTC(Z/+00:00) 문자열로 보내더라도 실제 의미는 KST 벽시계 시각이므로
  // 절대시각으로 해석하지 말고 Asia/Seoul 기준 로컬 시각으로 재해석한다.
  if (isUtcOffsetDateTime(text)) {
    return reinterpretUtcWallClockAsKst(text, fieldName);
  }

  // timezone 정보가 없으면 KST(+09:00)로 간주
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(text);
  const normalized = hasTimezone ? text : `${text}+09:00`;

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO datetime`);
  }

  return parsed.toISOString();
}

function getDefaultTitle() {
  const now = new Date();
  return `미팅 ${now.toLocaleDateString("ko-KR")} ${now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function isMeetingInput(value: unknown): value is MeetingApiInput {
  return typeof value === "object" && value !== null;
}

async function resolveProjectId(
  supabase: ReturnType<typeof createAdminClient>,
  input: MeetingApiInput
) {
  const projectId =
    input.project_id === undefined || input.project_id === null || input.project_id === ""
      ? null
      : String(input.project_id).trim();
  const projectNumber =
    input.project_number === undefined ||
    input.project_number === null ||
    input.project_number === ""
      ? null
      : String(input.project_number).trim();

  if (projectId && projectNumber) {
    throw new Error("project_id and project_number cannot be used together");
  }

  if (!projectId && !projectNumber) {
    return null;
  }

  const query = supabase.from("projects").select("id").limit(1);
  const { data, error } = projectId
    ? await query.eq("id", projectId).maybeSingle()
    : await query.eq("project_number", projectNumber!).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(projectId ? "project_id does not exist" : "project_number does not exist");
  }

  return data.id as string;
}

async function resolveCustomerId(
  supabase: ReturnType<typeof createAdminClient>,
  input: MeetingApiInput
) {
  const customerId =
    input.customer_id === undefined || input.customer_id === null || input.customer_id === ""
      ? null
      : String(input.customer_id).trim();
  const customerName =
    input.customer_name === undefined || input.customer_name === null || input.customer_name === ""
      ? null
      : String(input.customer_name).trim();

  if (customerId && customerName) {
    throw new Error("customer_id and customer_name cannot be used together");
  }

  if (!customerId && !customerName) {
    return null;
  }

  const query = supabase.from("customers").select("id").limit(1);
  const { data, error } = customerId
    ? await query.eq("id", customerId).maybeSingle()
    : await query.eq("name", customerName!).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(customerId ? "customer_id does not exist" : "customer_name does not exist");
  }

  return data.id as string;
}

async function createMeeting(
  supabase: ReturnType<typeof createAdminClient>,
  input: unknown
): Promise<MeetingApiResult> {
  if (!isMeetingInput(input)) {
    return { error: "Invalid payload item", input };
  }

  const transcriptValue = typeof input.transcript === "string" ? input.transcript : "";
  const transcript = transcriptValue.trim();
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!transcript) {
    return { error: "transcript is required", input };
  }

  const title =
    typeof input.title === "string" && input.title.trim() ? input.title.trim() : getDefaultTitle();
  const status = "완료";

  try {
    const projectId = await resolveProjectId(supabase, input);
    const customerId = await resolveCustomerId(supabase, input);
    const startedAtInput = parseDateTime(input.started_at, "started_at");
    const endedAtInput = parseDateTime(input.ended_at, "ended_at");
    const startedAt = startedAtInput ?? endedAtInput;

    if (startedAt && endedAtInput && new Date(endedAtInput) < new Date(startedAt)) {
      return { error: "ended_at must be greater than or equal to started_at", input };
    }

    const payload: {
      title: string;
      project_id: string | null;
      customer_id: string | null;
      transcript: string;
      summary: string;
      status: string;
      started_at?: string;
      ended_at: string | null;
    } = {
      title,
      project_id: projectId,
      customer_id: customerId,
      transcript,
      summary,
      status,
      ended_at: endedAtInput ?? new Date().toISOString(),
    };

    if (startedAt) {
      payload.started_at = startedAt;
    }

    const { data, error } = await supabase
      .from("meetings")
      .insert(payload)
      .select("id, title, project_id, customer_id, transcript, summary, status, started_at, ended_at, created_at, updated_at, projects(project_number, name), customers(id, name)")
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Meeting insert failed", input };
    }

    const project =
      Array.isArray(data.projects) ? (data.projects[0] ?? null) : (data.projects ?? null);
    const customer =
      Array.isArray(data.customers) ? (data.customers[0] ?? null) : (data.customers ?? null);

    logInfo("CREATE_MEETING_API", `API 미팅 등록: ${data.title}`, {
      resource: "meeting",
      resource_id: data.id,
      details: {
        project_id: data.project_id,
        customer_id: data.customer_id,
        status: data.status,
        source: "api",
      },
    });

    // 고객/프로젝트/리드가 미지정이고 전사록이 있으면 AI 자동매칭 (비동기, 실패 무시)
    const needsAiMatch = !data.project_id || !data.customer_id;
    if (needsAiMatch && data.transcript.trim()) {
      try {
        const aiResult = await runMeetingAiMatch(supabase, data.id);
        if (Object.keys(aiResult.matched).length > 0) {
          logInfo("AI_MATCH_MEETING", `API 미팅 AI 매칭: ${data.title}`, {
            resource: "meeting",
            resource_id: data.id,
            details: { matched: aiResult.matchedNames, source: "api" },
          });
          // 매칭된 값을 응답 데이터에 반영
          if (aiResult.matched.project_id) {
            data.project_id = aiResult.matched.project_id;
          }
          if (aiResult.matched.customer_id) {
            data.customer_id = aiResult.matched.customer_id;
          }
        }
      } catch {
        // AI 매칭 실패는 무시 (미팅 생성 자체는 성공)
      }
    }

    if (data.summary.trim()) {
      try {
        await sendMeetingSummarySlackMessage({ summary: data.summary });
      } catch (error) {
        logError("SEND_MEETING_SUMMARY_SLACK_FAILED", `미팅 Slack 발송 실패: ${data.title}`, {
          resource: "meeting",
          resource_id: data.id,
          details: {
            source: "api",
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return {
      success: true,
      data: {
        ...data,
        projects: project,
        customers: customer,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown meeting create error",
      input,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const results: MeetingApiResult[] = [];

    for (const item of items) {
      results.push(await createMeeting(supabase, item));
    }

    if (!Array.isArray(body)) {
      const [result] = results;
      if (!result || "error" in result) {
        return NextResponse.json(
          { error: result?.error ?? "Meeting insert failed" },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, data: result.data }, { status: 201 });
    }

    const hasError = results.some((result) => "error" in result);
    return NextResponse.json({ results }, { status: hasError ? 207 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

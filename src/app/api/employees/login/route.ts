import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/logger";

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 10;
const ATTEMPT_WINDOW_MS = ATTEMPT_WINDOW_MINUTES * 60 * 1000;

type EmployeeLoginRow = {
  id: string;
  name: string | null;
  login_id: string | null;
  is_active: boolean | null;
  failed_login_count: number | null;
  failed_login_window_started_at: string | null;
  last_failed_login_at: string | null;
  last_login_at: string | null;
};

function normalizeLoginId(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

const AUTH_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "example.com";

function toAuthEmail(loginId: string): string {
  return loginId.includes("@") ? loginId : `${loginId}@${AUTH_EMAIL_DOMAIN}`;
}

async function findEmployeeByLoginId(loginId: string): Promise<EmployeeLoginRow | null> {
  const supabase = createAdminClient();
  const authEmail = toAuthEmail(loginId);
  const loginBase = loginId.includes("@") ? loginId.split("@")[0] : loginId;

  const candidates = Array.from(
    new Set([loginId, authEmail, loginBase].map((v) => v.trim()).filter(Boolean))
  );

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("employees")
      .select(
        "id, name, login_id, is_active, failed_login_count, failed_login_window_started_at, last_failed_login_at, last_login_at"
      )
      .eq("login_id", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data as EmployeeLoginRow;
    }
  }

  return null;
}

async function handlePrecheck(loginId: string) {
  const employee = await findEmployeeByLoginId(loginId);

  if (!employee) {
    return NextResponse.json({
      allowed: true,
      email: toAuthEmail(loginId),
    });
  }

  if (employee.is_active === false) {
    logError("LOGIN_BLOCKED", `비활성 계정 로그인 차단: ${employee.login_id ?? loginId}`, {
      resource: "employee",
      resource_id: employee.id,
      details: {
        login_id: employee.login_id,
      },
    });

    return NextResponse.json({
      allowed: false,
      blocked: true,
      message: "계정이 비활성화되었습니다. 관리자에게 문의하세요.",
      email: toAuthEmail(loginId),
    });
  }

  return NextResponse.json({
    allowed: true,
    email: toAuthEmail(employee.login_id || loginId),
  });
}

async function handleFailure(loginId: string, reason: string | null) {
  const employee = await findEmployeeByLoginId(loginId);

  if (!employee) {
    logError("LOGIN_FAILED_UNKNOWN", `존재하지 않는 로그인 ID 시도: ${loginId}`, {
      resource: "employee",
      details: {
        login_id: loginId,
        reason,
      },
    });

    return NextResponse.json({
      blocked: false,
      remaining_attempts: null,
    });
  }

  if (employee.is_active === false) {
    return NextResponse.json({
      blocked: true,
      remaining_attempts: 0,
      message: "계정이 비활성화되었습니다. 관리자에게 문의하세요.",
    });
  }

  const now = new Date();
  const currentCount = employee.failed_login_count ?? 0;
  const windowStartedAt = employee.failed_login_window_started_at
    ? new Date(employee.failed_login_window_started_at)
    : null;

  const isWithinWindow =
    windowStartedAt && now.getTime() - windowStartedAt.getTime() <= ATTEMPT_WINDOW_MS;

  const nextCount = isWithinWindow ? currentCount + 1 : 1;
  const nextWindowStart = isWithinWindow
    ? (windowStartedAt as Date).toISOString()
    : now.toISOString();
  const shouldDeactivate = nextCount >= MAX_FAILED_ATTEMPTS;

  const updatePayload: Record<string, unknown> = {
    failed_login_count: nextCount,
    failed_login_window_started_at: nextWindowStart,
    last_failed_login_at: now.toISOString(),
  };

  if (shouldDeactivate) {
    updatePayload.is_active = false;
  }

  const supabase = createAdminClient();
  const { error: updateError } = await supabase
    .from("employees")
    .update(updatePayload)
    .eq("id", employee.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - nextCount);

  logError("LOGIN_FAILED", `로그인 실패: ${employee.login_id ?? loginId}`, {
    resource: "employee",
    resource_id: employee.id,
    details: {
      login_id: employee.login_id,
      failed_count: nextCount,
      remaining_attempts: remainingAttempts,
      blocked: shouldDeactivate,
      reason,
    },
  });

  if (shouldDeactivate) {
    logError("LOGIN_DEACTIVATED", `로그인 5회 실패로 계정 비활성화: ${employee.login_id ?? loginId}`, {
      resource: "employee",
      resource_id: employee.id,
      details: {
        login_id: employee.login_id,
        failed_count: nextCount,
        window_minutes: ATTEMPT_WINDOW_MINUTES,
      },
    });
  }

  return NextResponse.json({
    blocked: shouldDeactivate,
    remaining_attempts: remainingAttempts,
    message: shouldDeactivate
      ? "비밀번호 5회 오류로 계정이 비활성화되었습니다. 관리자에게 문의하세요."
      : `아이디 또는 비밀번호가 올바르지 않습니다. (${remainingAttempts}회 남음)`,
  });
}

async function handleSuccess(loginId: string) {
  const employee = await findEmployeeByLoginId(loginId);

  if (!employee) {
    return NextResponse.json({ success: true });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("employees")
    .update({
      failed_login_count: 0,
      failed_login_window_started_at: null,
      last_failed_login_at: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", employee.id);

  if (error) {
    throw new Error(error.message);
  }

  logInfo("LOGIN_SUCCESS", `로그인 성공: ${employee.login_id ?? loginId}`, {
    resource: "employee",
    resource_id: employee.id,
    details: {
      login_id: employee.login_id,
    },
  });

  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";
    const loginId = normalizeLoginId(body.login_id);

    if (!loginId) {
      return NextResponse.json({ error: "login_id is required" }, { status: 400 });
    }

    if (action === "precheck") {
      return await handlePrecheck(loginId);
    }

    if (action === "failure") {
      const reason = typeof body.reason === "string" ? body.reason : null;
      return await handleFailure(loginId, reason);
    }

    if (action === "success") {
      return await handleSuccess(loginId);
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

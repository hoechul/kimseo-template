import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logError } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

// 복잡한 비밀번호 자동 생성 (12자: 대문자+소문자+숫자+특수문자 포함)
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const all = upper + lower + digits + special;

  // 각 카테고리에서 최소 1자씩 보장
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // 나머지 8자 랜덤
  for (let i = 0; i < 8; i++) {
    required.push(all[Math.floor(Math.random() * all.length)]);
  }

  // 셔플
  for (let i = required.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join("");
}

// POST: 직원 Auth 유저 생성
export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { employee_id, login_id } = await request.json();
    const supabase = createAdminClient();

    const password = generatePassword();

    // login_id에 @가 없으면 인증용 이메일 도메인을 붙인다
    const email = login_id.includes("@") ? login_id : `${login_id}@${process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "example.com"}`;

    // Supabase Auth 유저 생성
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      logError("CREATE_AUTH", `직원 계정 생성 실패: ${authError.message}`, { resource: "employee", resource_id: employee_id });
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // employees 테이블에 auth_uid, login_id 업데이트
    const { error: updateError } = await supabase
      .from("employees")
      .update({
        auth_uid: authData.user.id,
        login_id,
        is_active: true,
        failed_login_count: 0,
        failed_login_window_started_at: null,
        last_failed_login_at: null,
      })
      .eq("id", employee_id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    logInfo("CREATE_AUTH", `직원 계정 생성: ${login_id}`, { resource: "employee", resource_id: employee_id });
    return NextResponse.json({ success: true, auth_uid: authData.user.id, generated_password: password });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

// PUT: 비밀번호 재설정
export async function PUT(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { auth_uid } = await request.json();
    const supabase = createAdminClient();

    const tempPassword = generatePassword();

    // Supabase Auth 비밀번호 업데이트
    const { error } = await supabase.auth.admin.updateUserById(auth_uid, {
      password: tempPassword,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("RESET_PASSWORD", "비밀번호 재설정", { resource: "employee", details: { auth_uid } });
    return NextResponse.json({ success: true, temp_password: tempPassword });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

// PATCH: 로그인 ID(이메일) 변경
export async function PATCH(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { auth_uid, login_id } = await request.json();
    const supabase = createAdminClient();

    // login_id에 @가 없으면 인증용 이메일 도메인을 붙인다 (same logic as POST)
    const email = login_id.includes("@") ? login_id : `${login_id}@${process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "example.com"}`;

    // Supabase Auth 이메일 업데이트
    const { error: authError } = await supabase.auth.admin.updateUserById(auth_uid, {
      email,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // employees 테이블의 login_id 업데이트
    const { error: updateError } = await supabase
      .from("employees")
      .update({ login_id })
      .eq("auth_uid", auth_uid);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    logInfo("CHANGE_LOGIN_ID", `로그인 ID 변경: ${login_id}`, { resource: "employee", details: { auth_uid } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

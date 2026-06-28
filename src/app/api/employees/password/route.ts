import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { logInfo, logError } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

// PATCH: 본인 비밀번호 변경
export async function PATCH(request: NextRequest) {
  try {
    const { current_password, new_password } = await request.json();

    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: "현재 비밀번호와 새 비밀번호를 입력해주세요" },
        { status: 400 }
      );
    }

    if (new_password.length < 6) {
      return NextResponse.json(
        { error: "새 비밀번호는 6자 이상이어야 합니다" },
        { status: 400 }
      );
    }

    const { user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    if (!user.email) {
      return NextResponse.json({ error: "인증된 이메일이 없습니다" }, { status: 400 });
    }

    // 현재 비밀번호 확인 (세션에 영향 없는 별도 클라이언트 사용)
    const verifyClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error: signInError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password: current_password,
    });

    if (signInError) {
      return NextResponse.json(
        { error: "현재 비밀번호가 일치하지 않습니다" },
        { status: 400 }
      );
    }

    // Admin client로 비밀번호 변경
    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    });

    if (error) {
      logError("CHANGE_PASSWORD", `비밀번호 변경 실패: ${error.message}`, {
        resource: "employee",
        details: { auth_uid: user.id },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await adminSupabase
      .from("employees")
      .update({
        failed_login_count: 0,
        failed_login_window_started_at: null,
        last_failed_login_at: null,
      })
      .eq("auth_uid", user.id);

    logInfo("CHANGE_PASSWORD", "비밀번호 변경 완료", {
      resource: "employee",
      details: { auth_uid: user.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

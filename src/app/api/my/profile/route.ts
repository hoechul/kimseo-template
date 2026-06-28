import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logInfo, logError } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, department, position, email, phone, login_id } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "이름은 필수 항목입니다" },
        { status: 400 }
      );
    }

    if (!login_id?.trim()) {
      return NextResponse.json(
        { error: "아이디는 필수 항목입니다" },
        { status: 400 }
      );
    }

    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const adminSupabase = createAdminClient();

    // 현재 직원 조회
    const { data: currentEmp } = await adminSupabase
      .from("employees")
      .select("id, login_id")
      .eq("auth_uid", user.id)
      .maybeSingle();

    if (!currentEmp) {
      return NextResponse.json(
        { error: "직원 정보를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // login_id 중복 체크 (본인 제외)
    if (login_id.trim() !== currentEmp.login_id) {
      const { data: existing } = await adminSupabase
        .from("employees")
        .select("id")
        .eq("login_id", login_id.trim())
        .neq("id", currentEmp.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: "이미 사용 중인 아이디입니다" },
          { status: 409 }
        );
      }
    }

    // 직원 정보 업데이트 (employee_type 제외)
    const { error } = await adminSupabase
      .from("employees")
      .update({
        name: name.trim(),
        department: department?.trim() || null,
        position: position?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        login_id: login_id.trim(),
      })
      .eq("id", currentEmp.id);

    if (error) {
      logError("UPDATE_PROFILE", `프로필 수정 실패: ${error.message}`, {
        resource: "employee",
        resource_id: currentEmp.id,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // login_id가 변경된 경우 auth email도 업데이트
    const newEmail = `${login_id.trim()}@${process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "example.com"}`;
    if (user.email !== newEmail) {
      await adminSupabase.auth.admin.updateUserById(user.id, {
        email: newEmail,
      });
    }

    logInfo("UPDATE_PROFILE", "프로필 수정 완료", {
      resource: "employee",
      resource_id: currentEmp.id,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

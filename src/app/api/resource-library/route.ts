import { NextRequest, NextResponse } from "next/server";

import { createFolder } from "@/lib/google-drive";
import { DRIVE_ENABLED } from "@/lib/drive-config";
import { logInfo } from "@/lib/logger";
import { RESOURCE_LIBRARY_DRIVE_FOLDER_ID } from "@/lib/resource-library";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import type { ResourceLibraryPost } from "@/lib/types";

function buildFolderName(title: string) {
  const trimmed = title.trim();
  return `자료실_${trimmed}`.slice(0, 120);
}

export async function GET() {
  try {
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { data, error } = await supabase
      .from("resource_library_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json((data ?? []) as ResourceLibraryPost[]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!title) {
      return NextResponse.json(
        { error: "제목을 입력해 주세요." },
        { status: 400 }
      );
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("id, name")
      .eq("auth_uid", user.id)
      .maybeSingle();

    const authorName = employee?.name ?? user.user_metadata?.name ?? user.email ?? "이름 없음";
    // Drive 연동이 켜진 경우에만 폴더 생성. 미설정이면 글만 저장(텍스트 자료실은 그대로 동작).
    let driveFolder: Awaited<ReturnType<typeof createFolder>> | null = null;
    if (DRIVE_ENABLED) {
      try {
        driveFolder = await createFolder(buildFolderName(title), RESOURCE_LIBRARY_DRIVE_FOLDER_ID);
      } catch (e) {
        console.error("자료실 Drive 폴더 생성 건너뜀:", e instanceof Error ? e.message : String(e));
      }
    }

    const { data, error } = await supabase
      .from("resource_library_posts")
      .insert({
        title,
        content,
        drive_folder_id: driveFolder?.id ?? null,
        author_employee_id: employee?.id ?? null,
        author_name: authorName,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("CREATE_RESOURCE_LIBRARY_POST", `자료 등록: ${data.id}`, {
      resource: "resource_library_post",
      resource_id: data.id,
      details: { drive_folder_id: driveFolder?.id ?? null },
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createFolder } from "@/lib/google-drive";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 프로젝트 유형별 Drive 폴더를 조회하거나 없으면 생성합니다.
 * POST { typeId } → { driveFolderId }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { typeId } = await request.json();

    // typeId가 null이면 루트 폴더 ID 반환
    if (!typeId) {
      return NextResponse.json({ driveFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID });
    }

    const supabase = await createClient();
    const { data: projectType, error: fetchError } = await supabase
      .from("project_types")
      .select("id, name, drive_folder_id")
      .eq("id", typeId)
      .single();

    if (fetchError || !projectType) {
      return NextResponse.json({ error: "프로젝트 유형을 찾을 수 없습니다" }, { status: 404 });
    }

    // 이미 Drive 폴더가 있으면 바로 반환
    if (projectType.drive_folder_id) {
      return NextResponse.json({ driveFolderId: projectType.drive_folder_id });
    }

    // 없으면 _프로젝트 루트 아래에 유형명 폴더 생성
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
    const folder = await createFolder(projectType.name, rootFolderId);

    // DB에 drive_folder_id 저장
    const { error: updateError } = await supabase
      .from("project_types")
      .update({ drive_folder_id: folder.id })
      .eq("id", typeId);

    if (updateError) {
      console.error("Failed to save type drive_folder_id:", updateError);
    }

    logInfo("CREATE_TYPE_FOLDER", `프로젝트 유형 폴더 생성: ${projectType.name}`, {
      resource: "drive_folder",
      resource_id: folder.id ?? undefined,
    });

    return NextResponse.json({ driveFolderId: folder.id });
  } catch (error) {
    console.error("Type folder error:", error);
    return NextResponse.json({ error: "유형 폴더 처리 실패" }, { status: 500 });
  }
}

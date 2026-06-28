import { NextResponse } from "next/server";
import { createFolder, moveFile } from "@/lib/google-drive";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 기존 프로젝트 폴더를 유형별 하위 폴더로 일괄 이동합니다.
 * - type_id가 없는 프로젝트는 첫 번째 유형(에이전시)으로 자동 설정
 * - 유형별 Drive 폴더가 없으면 생성
 * - 프로젝트 Drive 폴더를 유형 폴더 하위로 이동
 */
export async function POST() {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const supabase = await createClient();
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    // 1. 모든 프로젝트 유형 조회
    const { data: types, error: typesError } = await supabase
      .from("project_types")
      .select("id, name, drive_folder_id, sort_order")
      .order("sort_order", { ascending: true });

    if (typesError || !types?.length) {
      return NextResponse.json({ error: "프로젝트 유형을 불러올 수 없습니다" }, { status: 500 });
    }

    const defaultType = types[0];

    // 2. 유형별 Drive 폴더 보장 (없으면 생성)
    for (const type of types) {
      if (!type.drive_folder_id) {
        const folder = await createFolder(type.name, rootFolderId);
        type.drive_folder_id = folder.id;
        await supabase
          .from("project_types")
          .update({ drive_folder_id: folder.id })
          .eq("id", type.id);

        logInfo("CREATE_TYPE_FOLDER", `프로젝트 유형 폴더 생성: ${type.name}`, {
          resource: "drive_folder",
          resource_id: folder.id ?? undefined,
        });
      }
    }

    // 3. 모든 프로젝트 조회
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, name, project_number, type_id, drive_folder_id");

    if (projectsError) {
      return NextResponse.json({ error: "프로젝트를 불러올 수 없습니다" }, { status: 500 });
    }

    const results = {
      typeAssigned: 0,
      folderMoved: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const project of projects ?? []) {
      try {
        // 3a. type_id가 없으면 기본 유형 할당
        if (!project.type_id) {
          const { error: updateError } = await supabase
            .from("projects")
            .update({ type_id: defaultType.id })
            .eq("id", project.id);

          if (updateError) {
            results.errors.push(`${project.project_number}: 유형 할당 실패 - ${updateError.message}`);
            continue;
          }
          project.type_id = defaultType.id;
          results.typeAssigned++;
        }

        // 3b. Drive 폴더가 없으면 스킵
        if (!project.drive_folder_id) {
          results.skipped++;
          continue;
        }

        // 3c. 대상 유형 폴더 찾기
        const targetType = types.find((t) => t.id === project.type_id);
        if (!targetType?.drive_folder_id) {
          results.skipped++;
          continue;
        }

        // 3d. 루트 폴더에서 유형 폴더로 이동
        await moveFile(project.drive_folder_id, rootFolderId, targetType.drive_folder_id);
        results.folderMoved++;
      } catch (err) {
        results.errors.push(
          `${project.project_number}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    logInfo("MIGRATE_PROJECT_FOLDERS", `프로젝트 폴더 마이그레이션 완료`, {
      resource: "drive_folder",
      details: results,
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Migrate project folders error:", error);
    return NextResponse.json({ error: "마이그레이션 실패" }, { status: 500 });
  }
}

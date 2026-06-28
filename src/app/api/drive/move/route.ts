import { NextRequest, NextResponse } from "next/server";
import { moveFile } from "@/lib/google-drive";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { fileIds, fromFolderId, toFolderId } = await request.json();
    if (!fileIds?.length || !fromFolderId || !toFolderId) {
      return NextResponse.json(
        { error: "fileIds, fromFolderId, toFolderId 필요" },
        { status: 400 }
      );
    }

    const results = [];
    for (const fileId of fileIds) {
      const result = await moveFile(fileId, fromFolderId, toFolderId);
      results.push(result);
    }

    logInfo("MOVE_FILES", `파일 ${fileIds.length}개 이동`, {
      resource: "drive_file",
      details: { fileIds, fromFolderId, toFolderId },
    });

    return NextResponse.json({ success: true, moved: results.length });
  } catch (error) {
    console.error("Move files error:", error);
    return NextResponse.json(
      { error: "파일 이동 실패" },
      { status: 500 }
    );
  }
}

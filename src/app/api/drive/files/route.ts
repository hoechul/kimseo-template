import { NextRequest, NextResponse } from "next/server";
import { listFiles, uploadFile, deleteFile, renameFile } from "@/lib/google-drive";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const folderId = request.nextUrl.searchParams.get("folderId");
    if (!folderId) {
      return NextResponse.json({ error: "folderId 필요" }, { status: 400 });
    }
    const files = await listFiles(folderId);
    return NextResponse.json(files);
  } catch (error) {
    console.error("List files error:", error);
    return NextResponse.json(
      { error: "파일 목록 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const folderId = formData.get("folderId") as string;

    if (!file || !folderId) {
      return NextResponse.json(
        { error: "file과 folderId 필요" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(folderId, file.name, file.type, buffer);
    logInfo("UPLOAD_FILE", `파일 업로드: ${file.name}`, { resource: "drive_file", details: { folderId } });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload file error:", error);
    return NextResponse.json(
      { error: "파일 업로드 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { fileId, name } = await request.json();
    if (!fileId || !name) {
      return NextResponse.json({ error: "fileId와 name 필요" }, { status: 400 });
    }
    const result = await renameFile(fileId, name);
    logInfo("RENAME_FILE", `파일/폴더 이름 변경: ${name}`, { resource: "drive_file", resource_id: fileId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Rename file error:", error);
    return NextResponse.json(
      { error: "이름 변경 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const fileId = request.nextUrl.searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json({ error: "fileId 필요" }, { status: 400 });
    }
    await deleteFile(fileId);
    logInfo("DELETE_FILE", `파일 삭제: ${fileId}`, { resource: "drive_file", resource_id: fileId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json(
      { error: "파일 삭제 실패" },
      { status: 500 }
    );
  }
}

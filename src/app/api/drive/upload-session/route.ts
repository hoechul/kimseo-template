import { NextRequest, NextResponse } from "next/server";

import { createResumableUploadSession } from "@/lib/google-drive";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { folderId, fileName, mimeType, fileSize } = await request.json();

    if (!folderId || !fileName || !mimeType || !fileSize) {
      return NextResponse.json(
        { error: "folderId, fileName, mimeType, fileSize 필요" },
        { status: 400 }
      );
    }

    const uploadUrl = await createResumableUploadSession(
      folderId,
      fileName,
      mimeType,
      fileSize
    );

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("Upload session error:", error);
    return NextResponse.json(
      { error: "업로드 세션 생성 실패" },
      { status: 500 }
    );
  }
}

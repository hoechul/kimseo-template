import { NextRequest, NextResponse } from "next/server";

import { extractBusinessCardWithGemini } from "@/lib/gemini";
import { logError } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "이미지는 10MB 이하만 업로드할 수 있습니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await extractBusinessCardWithGemini({
      userAuthUid: user.id,
      mimeType: file.type,
      base64Data: buffer.toString("base64"),
    });

    return NextResponse.json({
      ...data,
      image_name: file.name,
      image_mime_type: file.type,
      image_base64: buffer.toString("base64"),
    });
  } catch (error) {
    logError(
      "BUSINESS_CARD_OCR_ERROR",
      error instanceof Error ? error.message : "Unknown server error",
      {
        resource: "business_card",
      }
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

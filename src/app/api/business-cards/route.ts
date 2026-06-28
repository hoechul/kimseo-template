import { NextRequest, NextResponse } from "next/server";

import { uploadBusinessCardImage } from "@/lib/business-card-drive";
import { DRIVE_ENABLED } from "@/lib/drive-config";
import { logError, logInfo } from "@/lib/logger";
import { asNullableFormattedKoreanPhoneNumber } from "@/lib/phone";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import type { BusinessCard, BusinessCardInputMethod } from "@/lib/types";

const REVIEW_NAME_PREFIX = "이름 확인 필요 (";

function asNullableTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveInputMethod(value: unknown): BusinessCardInputMethod {
  return value === "photo" ? "photo" : "manual";
}

function buildReviewFallbackName(values: {
  company_name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  image_name: string | null;
}) {
  const fallbackLabel =
    values.company_name ??
    values.position ??
    values.email ??
    values.phone ??
    values.image_name?.replace(/\.[^.]+$/, "") ??
    "명함";

  return `이름 확인 필요 (${fallbackLabel})`;
}

function resolveCardName(params: {
  rawName: unknown;
  inputMethod: BusinessCardInputMethod;
  company_name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  image_name: string | null;
}) {
  const name = asNullableTrimmedString(params.rawName);

  if (name) {
    return { name, needs_review: false };
  }

  if (params.inputMethod === "photo") {
    return {
      name: buildReviewFallbackName(params),
      needs_review: true,
    };
  }

  return { name: null, needs_review: false };
}

async function getCurrentEmployeeId(
  supabase: Awaited<ReturnType<typeof requireRouteUser>>["supabase"],
  authUserId: string
) {
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_uid", authUserId)
    .maybeSingle();

  return data?.id ?? null;
}

export async function GET() {
  try {
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { data, error } = await supabase
      .from("business_cards")
      .select("id,name,company_name,position,email,phone,address,input_method,drive_file_id,drive_web_view_link,drive_web_content_link,created_by,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json((data ?? []) as BusinessCard[]);
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

    const body = await request.json().catch(() => null);
    const inputMethod = resolveInputMethod(body?.input_method);
    const company_name = asNullableTrimmedString(body?.company_name);
    const position = asNullableTrimmedString(body?.position);
    const email = asNullableTrimmedString(body?.email);
    const phone = asNullableFormattedKoreanPhoneNumber(body?.phone);
    const image_name = asNullableTrimmedString(body?.image_name);

    const resolvedName = resolveCardName({
      rawName: body?.name,
      inputMethod,
      company_name,
      position,
      email,
      phone,
      image_name,
    });

    if (!resolvedName.name) {
      return NextResponse.json({ error: "이름은 필수입니다." }, { status: 400 });
    }

    const employeeId = await getCurrentEmployeeId(supabase, user.id);
    const payload = {
      name: resolvedName.name,
      company_name,
      position,
      email,
      phone,
      address: asNullableTrimmedString(body?.address),
      input_method: inputMethod,
      image_name,
      image_mime_type: asNullableTrimmedString(body?.image_mime_type),
      image_base64: asNullableTrimmedString(body?.image_base64),
      ocr_raw_text: asNullableTrimmedString(body?.ocr_raw_text),
      created_by: employeeId,
    };

    const shouldUploadImage =
      payload.input_method === "photo" &&
      payload.image_name &&
      payload.image_mime_type &&
      payload.image_base64;

    let driveFileId: string | null = null;
    let driveWebViewLink: string | null = null;
    let driveWebContentLink: string | null = null;

    // Drive 연동이 켜진 경우에만 이미지 업로드. 미설정이면 이미지 없이 명함만 저장(저장 실패 방지).
    if (shouldUploadImage && DRIVE_ENABLED) {
      const imageName = payload.image_name as string;
      const imageMimeType = payload.image_mime_type as string;
      const imageBase64 = payload.image_base64 as string;

      try {
        const uploadedFile = await uploadBusinessCardImage({
          fileName: imageName,
          mimeType: imageMimeType,
          base64Data: imageBase64,
        });

        driveFileId = uploadedFile.id ?? null;
        driveWebViewLink = uploadedFile.webViewLink ?? null;
        driveWebContentLink = uploadedFile.webContentLink ?? null;
      } catch (e) {
        console.error("명함 이미지 Drive 업로드 건너뜀:", e instanceof Error ? e.message : String(e));
      }
    }

    const { data, error } = await supabase
      .from("business_cards")
      .insert({
        ...payload,
        drive_file_id: driveFileId,
        drive_web_view_link: driveWebViewLink,
        drive_web_content_link: driveWebContentLink,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("CREATE_BUSINESS_CARD", `명함 등록: ${data.id}`, {
      resource: "business_card",
      resource_id: data.id,
      details: {
        input_method: payload.input_method,
        needs_review: resolvedName.name.startsWith(REVIEW_NAME_PREFIX),
      },
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logError(
      "CREATE_BUSINESS_CARD_ERROR",
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

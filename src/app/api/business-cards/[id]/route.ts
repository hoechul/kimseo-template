import { NextRequest, NextResponse } from "next/server";

import { deleteBusinessCardImage, uploadBusinessCardImage } from "@/lib/business-card-drive";
import { logError, logInfo } from "@/lib/logger";
import { asNullableFormattedKoreanPhoneNumber } from "@/lib/phone";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

const REVIEW_NAME_PREFIX = "이름 확인 필요 (";

function asNullableTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
  inputMethod: "photo" | "manual";
  company_name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  image_name: string | null;
}) {
  const name = asNullableTrimmedString(params.rawName);
  const fallbackName = buildReviewFallbackName(params);

  if (name) {
    return { name, needs_review: false };
  }

  if (params.inputMethod === "photo") {
    return {
      name: fallbackName,
      needs_review: true,
    };
  }

  return { name: null, needs_review: false };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const body = await request.json().catch(() => null);
    const inputMethod = body?.input_method === "photo" ? "photo" : "manual";
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

    const { data: existingCard, error: existingError } = await supabase
      .from("business_cards")
      .select(
        "id, input_method, image_name, image_mime_type, image_base64, drive_file_id, drive_web_view_link, drive_web_content_link"
      )
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existingCard) {
      return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
    }

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
    };

    const shouldKeepPhoto =
      payload.input_method === "photo" &&
      payload.image_name &&
      payload.image_mime_type &&
      payload.image_base64;

    let drive_file_id = shouldKeepPhoto ? existingCard.drive_file_id ?? null : null;
    let drive_web_view_link = shouldKeepPhoto ? existingCard.drive_web_view_link ?? null : null;
    let drive_web_content_link = shouldKeepPhoto
      ? existingCard.drive_web_content_link ?? null
      : null;

    const shouldUploadNewImage =
      Boolean(shouldKeepPhoto) &&
      (
        payload.image_name !== existingCard.image_name ||
        payload.image_mime_type !== existingCard.image_mime_type ||
        payload.image_base64 !== existingCard.image_base64 ||
        !existingCard.drive_file_id
      );

    if (shouldUploadNewImage && payload.image_name && payload.image_mime_type && payload.image_base64) {
      const uploadedFile = await uploadBusinessCardImage({
        fileName: payload.image_name,
        mimeType: payload.image_mime_type,
        base64Data: payload.image_base64,
      });

      drive_file_id = uploadedFile.id ?? null;
      drive_web_view_link = uploadedFile.webViewLink ?? null;
      drive_web_content_link = uploadedFile.webContentLink ?? null;

      if (existingCard.drive_file_id && existingCard.drive_file_id !== drive_file_id) {
        await deleteBusinessCardImage(existingCard.drive_file_id).catch(() => null);
      }
    } else if (!shouldKeepPhoto && existingCard.drive_file_id) {
      await deleteBusinessCardImage(existingCard.drive_file_id).catch(() => null);
    }

    const { data, error } = await supabase
      .from("business_cards")
      .update({
        ...payload,
        drive_file_id,
        drive_web_view_link,
        drive_web_content_link,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("UPDATE_BUSINESS_CARD", `명함 수정: ${id}`, {
      resource: "business_card",
      resource_id: id,
      details: {
        input_method: payload.input_method,
        needs_review: payload.name.startsWith(REVIEW_NAME_PREFIX),
      },
    });

    return NextResponse.json(data);
  } catch (error) {
    const { id } = await params;

    logError(
      "UPDATE_BUSINESS_CARD_ERROR",
      error instanceof Error ? error.message : "Unknown server error",
      {
        resource: "business_card",
        resource_id: id,
      }
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { data: existingCard, error: fetchError } = await supabase
      .from("business_cards")
      .select("id, drive_file_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    if (existingCard?.drive_file_id) {
      await deleteBusinessCardImage(existingCard.drive_file_id).catch(() => null);
    }

    const { error } = await supabase.from("business_cards").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("DELETE_BUSINESS_CARD", `명함 삭제: ${id}`, {
      resource: "business_card",
      resource_id: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const { id } = await params;

    logError(
      "DELETE_BUSINESS_CARD_ERROR",
      error instanceof Error ? error.message : "Unknown server error",
      {
        resource: "business_card",
        resource_id: id,
      }
    );

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function GET() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_filters")
    .select("id, phrase, enabled, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const body = (await request.json().catch(() => null)) as
    | { phrase?: unknown; enabled?: unknown }
    | null;

  const phrase = typeof body?.phrase === "string" ? body.phrase.trim() : "";
  if (!phrase) {
    return NextResponse.json({ error: "phrase 가 필요합니다." }, { status: 400 });
  }
  if (phrase.length > 200) {
    return NextResponse.json({ error: "phrase 는 200자 이하여야 합니다." }, { status: 400 });
  }

  const enabled = body?.enabled === undefined ? true : Boolean(body.enabled);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_filters")
    .insert({ phrase, enabled })
    .select("id, phrase, enabled, created_at, updated_at")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = status === 409 ? "이미 등록된 phrase 입니다." : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; phrase?: unknown; enabled?: unknown }
    | null;

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.phrase === "string") {
    const trimmed = body.phrase.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "phrase 는 비어있을 수 없습니다." }, { status: 400 });
    }
    if (trimmed.length > 200) {
      return NextResponse.json({ error: "phrase 는 200자 이하여야 합니다." }, { status: 400 });
    }
    patch.phrase = trimmed;
  }
  if (body?.enabled !== undefined) {
    patch.enabled = Boolean(body.enabled);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_filters")
    .update(patch)
    .eq("id", id)
    .select("id, phrase, enabled, created_at, updated_at")
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = status === 409 ? "이미 등록된 phrase 입니다." : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 가 필요합니다." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("notification_filters").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

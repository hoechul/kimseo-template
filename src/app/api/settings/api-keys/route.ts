import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function makePreview(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function normalizeKeyName(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidKeyName(name: string): boolean {
  return /^[a-z0-9_]{3,50}$/.test(name);
}

export async function GET(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const keyNameParam = request.nextUrl.searchParams.get("key_name");
  const keyName = keyNameParam ? normalizeKeyName(keyNameParam) : null;

  if (keyName && !isValidKeyName(keyName)) {
    return NextResponse.json({ error: "Invalid key_name" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("api_keys")
    .select("id, key_name, key_preview, note, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (keyName) {
    query = query.eq("key_name", keyName);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  try {
    const body = await request.json();

    const keyName = normalizeKeyName(String(body.key_name ?? ""));
    const rawKey = typeof body.raw_key === "string" ? body.raw_key.trim() : "";
    const note =
      body.note === undefined || body.note === null || String(body.note).trim() === ""
        ? null
        : String(body.note).trim();

    if (!isValidKeyName(keyName)) {
      return NextResponse.json({ error: "key_name must be snake_case" }, { status: 400 });
    }

    if (rawKey.length < 12) {
      return NextResponse.json(
        { error: "raw_key must be at least 12 characters" },
        { status: 400 }
      );
    }

    const payload = {
      key_name: keyName,
      key_hash: hashApiKey(rawKey),
      key_preview: makePreview(rawKey),
      note,
      is_active: true,
      created_by: user.id,
    };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("api_keys")
      .insert(payload)
      .select("id, key_name, key_preview, note, is_active, created_at, updated_at")
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("api_keys").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

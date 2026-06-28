import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapePostgrestLike } from "@/lib/utils";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const level = searchParams.get("level");
    const search = searchParams.get("search");

    const admin = createAdminClient();
    let query = admin
      .from("app_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (level && (level === "INFO" || level === "ERROR")) {
      query = query.eq("level", level);
    }

    if (search) {
      query = query.or(
        `message.ilike.%${escapePostgrestLike(search)}%,action.ilike.%${escapePostgrestLike(search)}%,actor_name.ilike.%${escapePostgrestLike(search)}%`
      );
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const body = await request.json();
    const { action, message, level, resource, resource_id, details } = body;

    if (!action || !message) {
      return NextResponse.json(
        { error: "action and message are required" },
        { status: 400 }
      );
    }

    const logLevel = level === "ERROR" ? "ERROR" : "INFO";
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    let actorId: string | null = null;
    let actorName: string | null = null;

    const admin = createAdminClient();

    // Resolve actor from authenticated user
    const { data: emp } = await admin
      .from("employees")
      .select("id, name")
      .eq("auth_uid", user.id)
      .maybeSingle();
    if (emp) {
      actorId = emp.id;
      actorName = emp.name;
    }
    const { error } = await admin.from("app_logs").insert({
      level: logLevel,
      action,
      message,
      resource: resource ?? null,
      resource_id: resource_id ?? null,
      actor_id: actorId,
      actor_name: actorName,
      ip_address: ip,
      details: details ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

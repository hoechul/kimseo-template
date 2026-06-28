import { NextRequest, NextResponse } from "next/server";

import { deleteFile, renameFile } from "@/lib/google-drive";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import type { ResourceLibraryPost } from "@/lib/types";

function buildFolderName(title: string) {
  const trimmed = title.trim();
  return `자료실_${trimmed}`.slice(0, 120);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { data, error } = await supabase
      .from("resource_library_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(data as ResourceLibraryPost);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
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

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!title) {
      return NextResponse.json(
        { error: "제목을 입력해 주세요." },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("resource_library_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (existing.drive_folder_id && existing.title !== title) {
      await renameFile(existing.drive_folder_id, buildFolderName(title));
    }

    const { data, error } = await supabase
      .from("resource_library_posts")
      .update({ title, content })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("UPDATE_RESOURCE_LIBRARY_POST", `자료 수정: ${id}`, {
      resource: "resource_library_post",
      resource_id: id,
    });

    return NextResponse.json(data);
  } catch (error) {
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

    const { data: existing, error: existingError } = await supabase
      .from("resource_library_posts")
      .select("id, drive_folder_id, title")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await supabase.from("resource_library_posts").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (existing.drive_folder_id) {
      await deleteFile(existing.drive_folder_id);
    }

    logInfo("DELETE_RESOURCE_LIBRARY_POST", `자료 삭제: ${id}`, {
      resource: "resource_library_post",
      resource_id: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

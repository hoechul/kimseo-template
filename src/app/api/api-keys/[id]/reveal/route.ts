import { NextRequest, NextResponse } from "next/server";

import { decryptApiKey } from "@/lib/api-key-secret";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, user, authUnavailable } = await requireRouteUser();

    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_encrypted")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "API Key를 찾을 수 없습니다." }, { status: 404 });
    }

    if (!data.key_encrypted) {
      return NextResponse.json(
        {
          error:
            "이 API Key는 기존 방식으로 생성되어 전체 값을 다시 확인할 수 없습니다. 새로 생성해주세요.",
        },
        { status: 409 }
      );
    }

    const rawKey = decryptApiKey(data.key_encrypted);

    logInfo("REVEAL_API_KEY", `API ??議고쉶: ${data.name}`, {
      resource: "api_key",
      resource_id: id,
      actor_id: user.id,
    });

    return NextResponse.json({ data: { raw_key: rawKey } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

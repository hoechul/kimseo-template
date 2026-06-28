import { NextRequest, NextResponse } from "next/server";
import { GmailAuthError, listMessages } from "@/lib/gmail";
import { deleteGmailToken, getGmailToken } from "@/lib/gmail-token";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function GET(request: NextRequest) {
  const { user, supabase, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const pageToken = searchParams.get("pageToken") ?? undefined;

  const token = await getGmailToken(supabase, user.id);
  if (!token) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const result = await listMessages(
      token.accessToken,
      token.refreshToken,
      token.expiryDate,
      { q, pageToken },
      { onTokenRefreshed: token.onTokenRefreshed }
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("Gmail list error:", err);
    if (err instanceof GmailAuthError) {
      // 만료/폐기된 토큰 삭제 → 재연결 UI 표시
      await deleteGmailToken(supabase, token.tokenId);
      return NextResponse.json({ error: "token_expired", message: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "gmail_error";
    return NextResponse.json({ error: "gmail_error", message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { GmailAuthError, sendEmail } from "@/lib/gmail";
import { deleteGmailToken, getGmailToken } from "@/lib/gmail-token";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function POST(request: NextRequest) {
  const { user, supabase, authUnavailable } = await requireRouteUser();
  if (!user) return createRouteAuthErrorResponse(authUnavailable);

  const token = await getGmailToken(supabase, user.id);
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  const body = await request.json();
  const { to, subject, message, replyToMessageId, threadId } = body;

  if (!to || !subject || !message) {
    return NextResponse.json({ error: "to, subject, message는 필수입니다." }, { status: 400 });
  }

  try {
    await sendEmail(
      token.accessToken,
      token.refreshToken,
      token.expiryDate,
      { to, subject, body: message, replyToMessageId, threadId },
      { onTokenRefreshed: token.onTokenRefreshed }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Gmail send error:", err);
    if (err instanceof GmailAuthError) {
      await deleteGmailToken(supabase, token.tokenId);
      return NextResponse.json({ error: "token_expired", message: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }
}

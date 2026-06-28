import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";
import { requireRouteUser } from "@/lib/route-auth";

function redirectToMail(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/dashboard/mail?error=${error}`, request.url));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return redirectToMail(request, error ?? "no_code");
  }

  try {
    const { supabase, user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return redirectToMail(
        request,
        authUnavailable ? "auth_unavailable" : "unauthorized"
      );
    }

    const tokenData = await exchangeCode(code);

    // refresh_token이 없으면(재연결 시) 기존 값을 보존
    const upsertData: Record<string, unknown> = {
      user_id: user.id,
      gmail_email: tokenData.email,
      access_token: tokenData.access_token,
      token_expiry: new Date(tokenData.expiry_date).toISOString(),
      is_global: true,
    };
    if (tokenData.refresh_token) {
      upsertData.refresh_token = tokenData.refresh_token;
    }

    const { error: upsertError } = await supabase.from("google_oauth_tokens").upsert(
      upsertData,
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("Token save error:", upsertError);
      return redirectToMail(request, "token_save_failed");
    }

    return NextResponse.redirect(new URL("/dashboard/mail?connected=true", request.url));
  } catch (err) {
    console.error("OAuth callback error:", err);
    return redirectToMail(request, "oauth_failed");
  }
}

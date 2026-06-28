import { SupabaseClient } from "@supabase/supabase-js";

type GoogleTokenRow = {
  id: string;
  gmail_email: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
};

function toTokenPayload(
  supabase: SupabaseClient,
  token: GoogleTokenRow | null
) {
  if (!token) return null;

  const onTokenRefreshed = async (newAccessToken: string, newExpiry: number) => {
    const { error } = await supabase
      .from("google_oauth_tokens")
      .update({
        access_token: newAccessToken,
        token_expiry: new Date(newExpiry).toISOString(),
      })
      .eq("id", token.id);

    if (error) {
      console.error("[GoogleToken] 토큰 갱신 DB 저장 실패:", error.message);
    }
  };

  return {
    id: token.id,
    email: token.gmail_email,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiryDate: new Date(token.token_expiry).getTime(),
    onTokenRefreshed,
  };
}

export async function getGoogleOAuthToken(
  supabase: SupabaseClient,
  userId: string
) {
  const { data: token } = await supabase
    .from("google_oauth_tokens")
    .select("id, gmail_email, access_token, refresh_token, token_expiry")
    .or(`user_id.eq.${userId},is_global.eq.true`)
    .order("is_global", { ascending: false })
    .limit(1)
    .single();

  return toTokenPayload(supabase, token as GoogleTokenRow | null);
}

export async function getGlobalGoogleOAuthToken(supabase: SupabaseClient) {
  const { data: token } = await supabase
    .from("google_oauth_tokens")
    .select("id, gmail_email, access_token, refresh_token, token_expiry")
    .eq("is_global", true)
    .limit(1)
    .single();

  return toTokenPayload(supabase, token as GoogleTokenRow | null);
}

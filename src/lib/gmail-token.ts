import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gmail API 호출에 필요한 토큰을 조회하고,
 * 토큰 갱신 시 DB에 자동 저장하는 콜백을 반환합니다.
 */
export async function getGmailToken(supabase: SupabaseClient, userId: string) {
  const { data: token } = await supabase
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, token_expiry")
    .or(`user_id.eq.${userId},is_global.eq.true`)
    .order("is_global", { ascending: false })
    .limit(1)
    .single();

  if (!token) return null;

  const onTokenRefreshed = async (newAccessToken: string, newExpiry: number) => {
    await supabase
      .from("google_oauth_tokens")
      .update({
        access_token: newAccessToken,
        token_expiry: new Date(newExpiry).toISOString(),
      })
      .eq("id", token.id);
  };

  return {
    tokenId: token.id as string,
    accessToken: token.access_token as string,
    refreshToken: token.refresh_token as string,
    expiryDate: new Date(token.token_expiry).getTime(),
    onTokenRefreshed,
  };
}

/** 만료/폐기된 토큰을 DB에서 삭제하여 재연결 UI가 표시되도록 합니다. */
export async function deleteGmailToken(supabase: SupabaseClient, tokenId: string) {
  await supabase.from("google_oauth_tokens").delete().eq("id", tokenId);
}

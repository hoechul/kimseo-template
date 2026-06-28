import { createAdminClient } from "@/lib/supabase/admin";
import { getSlackSettings, sendSlackMessage } from "@/lib/slack";

export interface NotificationFilterRow {
  id: string;
  phrase: string;
  enabled: boolean;
}

/**
 * SMS/알림 본문에 등록된 blocklist phrase 가 contains 되는지 검사한다.
 * 하나라도 포함되면 차단 (Make 의 "does not contain AND ..." 와 동치 = NOR).
 * 비교는 trim + case-insensitive 로 수행.
 */
export async function shouldForwardNotification(text: string): Promise<{
  forward: boolean;
  matched: string | null;
}> {
  const normalized = text.toLowerCase();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_filters")
    .select("phrase, enabled")
    .eq("enabled", true);

  if (error) {
    console.error("[notification-filter] load failed:", error.message);
    return { forward: true, matched: null };
  }

  for (const row of data ?? []) {
    const phrase = String(row.phrase ?? "").trim().toLowerCase();
    if (!phrase) continue;
    if (normalized.includes(phrase)) {
      return { forward: false, matched: row.phrase as string };
    }
  }

  return { forward: true, matched: null };
}

/**
 * 필터 통과한 알림을 Slack SMS 채널로 전달.
 * 채널/봇토큰이 설정되어 있지 않거나 전송 실패해도 webhook 응답에는 영향 주지 않는다.
 */
export async function forwardNotificationToSlack(text: string): Promise<{
  delivered: boolean;
  skipped?: "no_channel" | "no_token";
  error?: string;
}> {
  try {
    const { botToken, smsChannel } = await getSlackSettings();
    if (!botToken) return { delivered: false, skipped: "no_token" };
    if (!smsChannel) return { delivered: false, skipped: "no_channel" };

    await sendSlackMessage({
      channel: smsChannel,
      text,
      botToken,
    });

    return { delivered: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[notification-filter] slack forward failed:", message);
    return { delivered: false, error: message };
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getSlackSettings, sendDailyScheduleSlackMessage } from "@/lib/slack";
import { getSystemSetting } from "@/lib/system-settings";
import { toKstDate, toKstDateString } from "@/lib/date";
import { createAdminClient } from "@/lib/supabase/admin";

const LAST_SENT_DATE_KEY = "slack_schedule_last_sent_date";

function isScheduledTime(now: Date, scheduleTime: string) {
  const kstNow = toKstDate(now);
  const [hour, minute] = scheduleTime.split(":").map((value) => Number(value));

  return kstNow.getUTCHours() === hour && kstNow.getUTCMinutes() === minute;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const force = request.nextUrl.searchParams.get("force") === "1";
    const { botToken, scheduleChannel, scheduleTime } = await getSlackSettings();

    if (!botToken) {
      return NextResponse.json({ error: "Slack Bot Token이 설정되지 않았습니다." }, { status: 500 });
    }

    if (!scheduleChannel) {
      return NextResponse.json({ error: "Slack 일정 공유 채널이 설정되지 않았습니다." }, { status: 500 });
    }

    const today = toKstDateString(now);
    const lastSentDate = await getSystemSetting(LAST_SENT_DATE_KEY);

    if (!force && !isScheduledTime(now, scheduleTime)) {
      return NextResponse.json({ success: true, skipped: true, reason: "outside_scheduled_time", scheduleTime });
    }

    if (!force && lastSentDate === today) {
      return NextResponse.json({ success: true, skipped: true, reason: "already_sent_today", date: today });
    }

    await sendDailyScheduleSlackMessage(now);

    const admin = createAdminClient();
    const { error } = await admin.from("system_settings").upsert(
      {
        key: LAST_SENT_DATE_KEY,
        value: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      sent: true,
      date: today,
      channel: scheduleChannel,
      scheduleTime,
      forced: force,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일정 Slack 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}

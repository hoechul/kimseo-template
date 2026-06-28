import { NextRequest, NextResponse } from "next/server";

import { sendUpcomingScheduleReminderSlackMessages } from "@/lib/slack";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendUpcomingScheduleReminderSlackMessages(new Date());

    return NextResponse.json({
      success: true,
      sent: result.count,
      schedule_ids: result.scheduleIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "일정 Slack 리마인드 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}

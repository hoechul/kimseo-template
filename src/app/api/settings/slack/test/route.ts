import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { sendSlackProjectTestMessage } from "@/lib/slack";

export async function POST() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  try {
    await sendSlackProjectTestMessage();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Slack 테스트 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}

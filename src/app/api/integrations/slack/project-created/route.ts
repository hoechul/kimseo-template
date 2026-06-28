import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { isSlackConfigured, sendProjectCreatedSlackMessage } from "@/lib/slack";

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const body = await request.json().catch(() => null);
  const projectNumber = asTrimmedString(body?.project_number);
  const projectName = asTrimmedString(body?.project_name);

  if (!projectNumber || !projectName) {
    return Response.json({ error: "project_number and project_name are required" }, { status: 400 });
  }

  // Slack 미연동(토큰 없음)이면 알림을 조용히 건너뛴다(경고 토스트 방지).
  if (!(await isSlackConfigured())) {
    return Response.json({ skipped: true });
  }

  try {
    await sendProjectCreatedSlackMessage({
      projectNumber,
      projectName,
      customerName: asTrimmedString(body?.customer_name) || null,
      status: asTrimmedString(body?.status) || null,
      projectUrl: asTrimmedString(body?.project_url) || null,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Slack 프로젝트 알림 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}

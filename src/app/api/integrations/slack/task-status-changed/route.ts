import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSlackConfigured, sendTaskSlackNotification } from "@/lib/slack";

function asTrimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const body = await request.json().catch(() => null);
  const taskId = asTrimmed(body?.task_id);
  const newStatus = asTrimmed(body?.new_status);
  const prevStatus = asTrimmed(body?.prev_status);

  if (!taskId || !newStatus) {
    return Response.json({ error: "task_id and new_status are required" }, { status: 400 });
  }

  // Slack 미연동이면 조용히 건너뛴다(경고 토스트 방지).
  if (!(await isSlackConfigured())) {
    return Response.json({ skipped: true });
  }

  let actorName: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("employees")
      .select("name")
      .eq("auth_uid", user.id)
      .maybeSingle();
    actorName = data?.name ?? null;
  } catch {
    // actorName은 보조 정보이므로 조회 실패를 무시한다
  }

  try {
    const result = await sendTaskSlackNotification({
      taskId,
      prevStatus: prevStatus || null,
      newStatus,
      taskUrl: asTrimmed(body?.task_url) || null,
      actorName,
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Slack 할일 상태 알림 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}

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
  if (!taskId) {
    return Response.json({ error: "task_id is required" }, { status: 400 });
  }

  // Slack 미연동이면 조용히 건너뛴다(경고 토스트 방지).
  if (!(await isSlackConfigured())) {
    return Response.json({ skipped: true });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .select("status")
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return Response.json({ error: "task not found" }, { status: 404 });
    }

    const result = await sendTaskSlackNotification({
      taskId,
      prevStatus: null,
      newStatus: data.status as string,
      taskUrl: asTrimmed(body?.task_url) || null,
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Slack 할일 등록 알림 발송에 실패했습니다." },
      { status: 500 }
    );
  }
}

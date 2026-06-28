import { runMeetingAiMatch } from "@/lib/meeting-ai-match";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

export async function POST(request: Request) {
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const { meetingId } = await request.json();
  if (!meetingId || typeof meetingId !== "string") {
    return Response.json({ error: "meetingId is required" }, { status: 400 });
  }

  try {
    const result = await runMeetingAiMatch(supabase, meetingId);
    return Response.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Meeting AI match error:", msg, error);
    return Response.json({ error: `AI 매칭 실패: ${msg}` }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { uploadFile, updateFileContent } from "@/lib/google-drive";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createClient } from "@/lib/supabase/server";

function buildFileContent(meeting: {
  title: string;
  summary: string;
  transcript: string;
  started_at: string;
  ended_at: string | null;
}) {
  const lines: string[] = [];

  lines.push(`# ${meeting.title}`);
  lines.push("");
  lines.push(`일시: ${new Date(meeting.started_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  if (meeting.ended_at) {
    lines.push(`종료: ${new Date(meeting.ended_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  }

  if (meeting.summary?.trim()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## 요약");
    lines.push("");
    lines.push(meeting.summary.trim());
  }

  if (meeting.transcript?.trim()) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## 전사록");
    lines.push("");
    lines.push(meeting.transcript.trim());
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * 미팅 전사록/요약본을 연결된 프로젝트의 Drive 폴더에 파일로 저장합니다.
 * POST { meetingId }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const { meetingId } = await request.json();
    if (!meetingId) {
      return NextResponse.json({ error: "meetingId 필요" }, { status: 400 });
    }

    const supabase = await createClient();

    // 미팅 조회
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, title, transcript, summary, started_at, ended_at, project_id, drive_file_id")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "미팅을 찾을 수 없습니다" }, { status: 404 });
    }

    // 프로젝트 연결 확인
    if (!meeting.project_id) {
      return NextResponse.json({ error: "연결된 프로젝트가 없습니다" }, { status: 400 });
    }

    // 전사록 또는 요약본이 있어야 함
    if (!meeting.transcript?.trim() && !meeting.summary?.trim()) {
      return NextResponse.json({ error: "전사록 또는 요약본이 없습니다" }, { status: 400 });
    }

    // 프로젝트의 Drive 폴더 ID 조회
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, drive_folder_id, project_number, name")
      .eq("id", meeting.project_id)
      .single();

    if (projectError || !project?.drive_folder_id) {
      return NextResponse.json({ error: "프로젝트 Drive 폴더가 없습니다" }, { status: 400 });
    }

    const content = buildFileContent(meeting);
    const buffer = Buffer.from(content, "utf-8");
    const fileName = `${meeting.title}.txt`;

    let fileId: string | null = null;

    if (meeting.drive_file_id) {
      // 기존 파일 업데이트
      try {
        const updated = await updateFileContent(meeting.drive_file_id, "text/plain", buffer);
        fileId = updated.id ?? meeting.drive_file_id;
      } catch {
        // 파일이 삭제됐을 수 있으므로 새로 생성
        const uploaded = await uploadFile(project.drive_folder_id, fileName, "text/plain", buffer);
        fileId = uploaded.id ?? null;
      }
    } else {
      // 새 파일 생성
      const uploaded = await uploadFile(project.drive_folder_id, fileName, "text/plain", buffer);
      fileId = uploaded.id ?? null;
    }

    // drive_file_id 저장
    if (fileId && fileId !== meeting.drive_file_id) {
      await supabase
        .from("meetings")
        .update({ drive_file_id: fileId })
        .eq("id", meetingId);
    }

    logInfo("SYNC_MEETING_DRIVE", `미팅 회의록 Drive 저장: ${meeting.title}`, {
      resource: "meeting",
      resource_id: meetingId,
    });

    return NextResponse.json({ success: true, fileId });
  } catch (error) {
    console.error("Meeting drive sync error:", error);
    return NextResponse.json({ error: "Drive 파일 저장 실패" }, { status: 500 });
  }
}

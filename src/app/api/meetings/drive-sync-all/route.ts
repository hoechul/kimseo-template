import { NextResponse } from "next/server";
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
 * 프로젝트에 연결된 모든 미팅의 전사록/요약본을 Drive 폴더에 일괄 저장합니다.
 */
export async function POST() {
  try {
    const { user, authUnavailable } = await requireRouteUser();
    if (!user) {
      return createRouteAuthErrorResponse(authUnavailable);
    }

    const supabase = await createClient();

    // 프로젝트가 연결되어 있고 전사록 또는 요약이 있는 미팅 조회
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, title, transcript, summary, started_at, ended_at, project_id, drive_file_id")
      .not("project_id", "is", null);

    if (meetingsError) {
      return NextResponse.json({ error: "미팅 조회 실패" }, { status: 500 });
    }

    // 관련 프로젝트의 drive_folder_id 일괄 조회
    const projectIds = [...new Set(meetings?.map((m) => m.project_id).filter(Boolean) as string[])];
    const { data: projects } = await supabase
      .from("projects")
      .select("id, drive_folder_id")
      .in("id", projectIds);

    const projectFolderMap = new Map<string, string>();
    for (const p of projects ?? []) {
      if (p.drive_folder_id) {
        projectFolderMap.set(p.id, p.drive_folder_id);
      }
    }

    const results = { synced: 0, skipped: 0, errors: [] as string[] };

    for (const meeting of meetings ?? []) {
      try {
        // 전사록/요약이 없으면 스킵
        if (!meeting.transcript?.trim() && !meeting.summary?.trim()) {
          results.skipped++;
          continue;
        }

        const folderId = projectFolderMap.get(meeting.project_id!);
        if (!folderId) {
          results.skipped++;
          continue;
        }

        const content = buildFileContent(meeting);
        const buffer = Buffer.from(content, "utf-8");
        const fileName = `${meeting.title}.txt`;

        let fileId: string | null = null;

        if (meeting.drive_file_id) {
          try {
            const updated = await updateFileContent(meeting.drive_file_id, "text/plain", buffer);
            fileId = updated.id ?? meeting.drive_file_id;
          } catch {
            const uploaded = await uploadFile(folderId, fileName, "text/plain", buffer);
            fileId = uploaded.id ?? null;
          }
        } else {
          const uploaded = await uploadFile(folderId, fileName, "text/plain", buffer);
          fileId = uploaded.id ?? null;
        }

        if (fileId && fileId !== meeting.drive_file_id) {
          await supabase
            .from("meetings")
            .update({ drive_file_id: fileId })
            .eq("id", meeting.id);
        }

        results.synced++;
      } catch (err) {
        results.errors.push(`${meeting.title}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logInfo("SYNC_ALL_MEETINGS_DRIVE", `미팅 회의록 일괄 Drive 저장`, {
      resource: "meeting",
      details: results,
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Meeting drive sync all error:", error);
    return NextResponse.json({ error: "일괄 동기화 실패" }, { status: 500 });
  }
}

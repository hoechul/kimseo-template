"use client";

import { DriveFileBrowser } from "@/components/drive-file-browser";
import type { Project } from "@/lib/types";

interface TabFilesProps {
  project: Project;
}

export function TabFiles({ project }: TabFilesProps) {
  const folderId = project.drive_folder_id;

  if (!folderId) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
        이 프로젝트에는 Google Drive 폴더가 연결되지 않았습니다. 프로젝트 상세에서 폴더를 생성한 후 이용해 주세요.
      </div>
    );
  }

  return <DriveFileBrowser folderId={folderId} title="프로젝트 파일" />;
}

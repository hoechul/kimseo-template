"use client";

import Link from "next/link";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader, PageShell, PageToolbar } from "@/components/page-shell";
import { ResourceLibraryForm } from "@/components/resource-library-form";
import { Button } from "@/components/ui/button";
import { uploadFileToDrive } from "@/lib/drive-upload";
import type { ResourceLibraryPost } from "@/lib/types";

interface UploadState {
  active: boolean;
  progress: number;
  currentFileName: string | null;
  uploadedCount: number;
  totalCount: number;
}

async function uploadPendingFiles(
  folderId: string | null,
  files: File[],
  setUploadState: (state: UploadState) => void
) {
  if (!folderId || files.length === 0) {
    return;
  }

  for (const [index, file] of files.entries()) {
    setUploadState({
      active: true,
      progress: Math.round((index / files.length) * 100),
      currentFileName: file.name,
      uploadedCount: index,
      totalCount: files.length,
    });

    await uploadFileToDrive(folderId, file);

    setUploadState({
      active: true,
      progress: Math.round(((index + 1) / files.length) * 100),
      currentFileName: file.name,
      uploadedCount: index + 1,
      totalCount: files.length,
    });
  }
}

export default function NewResourceLibraryPage() {
  const router = useRouter();

  const handleSave = async (
    values: { title: string; content: string },
    files: File[],
    setUploadState: (state: UploadState) => void
  ) => {
    try {
      const response = await fetch("/api/resource-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        console.error("자료 등록 실패:", result.error ?? "알 수 없는 오류");
        toast.error("자료 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      const post = result as ResourceLibraryPost;
      await uploadPendingFiles(post.drive_folder_id, files, setUploadState);

      toast.success("자료가 등록되었습니다.");
      router.push(`/dashboard/resource-library/${post.id}`);
    } catch (error) {
      console.error("자료 등록 실패:", error instanceof Error ? error.message : String(error));
      toast.error("자료 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "자료실", href: "/dashboard/resource-library" },
          { label: "자료 추가" },
        ]}
        title="자료 추가"
        description="제목, 내용, 첨부 파일을 한 번에 등록할 수 있습니다."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/resource-library">
              <ArrowLeft className="h-4 w-4" />
              목록
            </Link>
          </Button>
        }
      />

      <PageToolbar className="gap-4 bg-gradient-to-r from-primary/7 via-background to-secondary/40">
        <div className="flex items-start gap-4 rounded-[1.25rem] border border-border/70 bg-background/75 px-4 py-4">
          <div className="rounded-2xl border border-primary/10 bg-primary/8 p-3 text-primary">
            <FolderPlus className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">구글드라이브 자동 연동</p>
            <p className="text-sm leading-6 text-muted-foreground">
              저장 시 자료실 전용 Google Drive 폴더가 생성되고, 선택한 파일이 해당 폴더로 업로드됩니다.
            </p>
          </div>
        </div>
      </PageToolbar>

      <ResourceLibraryForm post={null} onSave={handleSave} onCancel={() => router.push("/dashboard/resource-library")} />
    </PageShell>
  );
}

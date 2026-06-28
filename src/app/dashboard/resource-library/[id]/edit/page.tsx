"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { ErrorState, LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { ResourceLibraryForm } from "@/components/resource-library-form";
import { useMasking } from "@/components/masking-provider";
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

export default function EditResourceLibraryPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const { mask } = useMasking();

  const [post, setPost] = useState<ResourceLibraryPost | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/resource-library/${postId}`, { cache: "no-store" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "알 수 없는 오류");
      }

      setPost(result as ResourceLibraryPost);
    } catch (error) {
      console.error("자료 조회 실패:", error instanceof Error ? error.message : String(error));
      toast.error("자료를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void fetchPost();
  }, [fetchPost]);

  const handleSave = async (
    values: { title: string; content: string },
    files: File[],
    setUploadState: (state: UploadState) => void
  ) => {
    try {
      const response = await fetch(`/api/resource-library/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();

      if (!response.ok) {
        console.error("자료 수정 실패:", result.error ?? "알 수 없는 오류");
        toast.error("자료 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      const nextPost = result as ResourceLibraryPost;
      await uploadPendingFiles(nextPost.drive_folder_id, files, setUploadState);

      toast.success("자료가 수정되었습니다.");
      router.push(`/dashboard/resource-library/${postId}`);
    } catch (error) {
      console.error("자료 수정 실패:", error instanceof Error ? error.message : String(error));
      toast.error("자료 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  if (loading) {
    return <LoadingState title="자료 수정 화면을 준비하는 중입니다." description="자료 정보와 첨부 파일을 확인하고 있습니다." />;
  }

  if (!post) {
    return (
      <ErrorState
        title="자료를 찾을 수 없습니다."
        description="이미 삭제되었거나 접근할 수 없는 자료입니다."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/resource-library">목록으로</Link>
          </Button>
        }
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "자료실", href: "/dashboard/resource-library" },
          { label: mask("title", post.title), href: `/dashboard/resource-library/${postId}` },
          { label: "수정" },
        ]}
        title="자료 수정"
        description="제목과 내용을 변경하고 첨부 파일을 추가하거나 삭제할 수 있습니다."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/dashboard/resource-library/${postId}`}>
              <ArrowLeft className="h-4 w-4" />
              상세로
            </Link>
          </Button>
        }
      />

      <ResourceLibraryForm
        post={post}
        onSave={handleSave}
        onCancel={() => router.push(`/dashboard/resource-library/${postId}`)}
      />
    </PageShell>
  );
}

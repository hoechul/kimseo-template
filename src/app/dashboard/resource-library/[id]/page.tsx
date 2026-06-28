"use client";

import Link from "next/link";
import { ArrowLeft, PencilLine, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { DriveFileBrowser } from "@/components/drive-file-browser";
import { ErrorState, LoadingState, PageHeader, PageShell, SectionCard } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Button } from "@/components/ui/button";
import type { ResourceLibraryPost } from "@/lib/types";

const formatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export default function ResourceLibraryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const { mask } = useMasking();

  const [post, setPost] = useState<ResourceLibraryPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!post || deleting) {
      return;
    }

    if (!confirm(`"${post.title}" 자료를 삭제하시겠습니까?`)) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch(`/api/resource-library/${postId}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "알 수 없는 오류");
      }

      toast.success("자료가 삭제되었습니다.");
      router.push("/dashboard/resource-library");
    } catch (error) {
      console.error("자료 삭제 실패:", error instanceof Error ? error.message : String(error));
      toast.error("자료 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState title="자료를 불러오는 중입니다." description="본문과 첨부 파일 정보를 준비하고 있습니다." />;
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

  const maskedTitle = mask("title", post.title);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "자료실", href: "/dashboard/resource-library" },
          { label: maskedTitle },
        ]}
        title={maskedTitle}
        description="자료 설명과 첨부 파일을 함께 관리할 수 있습니다."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/dashboard/resource-library">
                <ArrowLeft className="h-4 w-4" />
                목록
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/resource-library/${postId}/edit`}>
                <PencilLine className="h-4 w-4" />
                수정
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              <Trash2 className="h-4 w-4" />
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>작성자 {mask("name", post.author_name)}</span>
            <span>등록 {formatDate(post.created_at)}</span>
            {post.updated_at !== post.created_at ? <span>수정 {formatDate(post.updated_at)}</span> : null}
          </div>
          <div className="min-h-[20rem] whitespace-pre-wrap text-sm leading-7 text-foreground">
            {mask("generic", post.content)}
          </div>
        </div>
      </SectionCard>

      {post.drive_folder_id ? <DriveFileBrowser folderId={post.drive_folder_id} /> : null}
    </PageShell>
  );
}

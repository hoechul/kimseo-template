"use client";

import Link from "next/link";
import { FolderKanban, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  PageToolbar,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResourceLibraryPost } from "@/lib/types";

const formatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export default function ResourceLibraryPage() {
  const { mask } = useMasking();
  const [posts, setPosts] = useState<ResourceLibraryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const response = await fetch("/api/resource-library", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "알 수 없는 오류");
      }

      setPosts(Array.isArray(result) ? (result as ResourceLibraryPost[]) : []);
    } catch (error) {
      console.error("자료실 목록 조회 실패:", error instanceof Error ? error.message : String(error));
      toast.error("자료실 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPosts([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  const filteredPosts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return posts;
    }

    return posts.filter((post) => `${post.title}\n${post.content}\n${post.author_name}`.toLowerCase().includes(keyword));
  }, [posts, search]);

  return (
    <PageShell>
      <PageHeader
        title="자료실"
        description="업무 자료를 게시판 형태로 관리하고, 첨부 파일은 Google Drive와 연동해 보관합니다."
        actions={
          <Button asChild>
            <Link href="/dashboard/resource-library/new">
              <Plus className="h-4 w-4" />
              자료 추가
            </Link>
          </Button>
        }
      />

      <StatsGrid columns={2}>
        <StatCard
          label="등록 자료"
          value={`${posts.length}건`}
          description="현재 자료실에 등록된 게시물 수"
          icon={FolderKanban}
        />
        <StatCard
          label="최근 등록"
          value={posts[0] ? formatDate(posts[0].created_at) : "-"}
          description="가장 최근에 등록된 자료 시점"
          icon={FolderKanban}
          tone={posts.length > 0 ? "info" : "default"}
        />
      </StatsGrid>

      <PageToolbar>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="제목, 내용, 작성자로 검색"
            className="pl-10"
          />
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState title="자료실을 불러오는 중입니다." description="등록된 자료 목록을 정리하고 있습니다." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchPosts()} />
      ) : filteredPosts.length === 0 ? (
        <EmptyState
          title={search ? "검색 결과가 없습니다." : "등록된 자료가 없습니다."}
          description={search ? "다른 검색어로 다시 확인해 주세요." : "첫 자료를 등록해 업무 문서와 파일을 보관하세요."}
          action={
            !search ? (
              <Button asChild>
                <Link href="/dashboard/resource-library/new">
                  <Plus className="h-4 w-4" />
                  자료 추가
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <Link
              key={post.id}
              href={`/dashboard/resource-library/${post.id}`}
              className="block rounded-[1.5rem] border border-border/70 bg-card/85 p-5 shadow-sm transition-colors hover:bg-muted/35"
            >
              <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{mask("title", post.title)}</h2>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {mask("generic", post.content)}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>작성자 {mask("name", post.author_name)}</span>
                <span>등록 {formatDate(post.created_at)}</span>
                {post.updated_at !== post.created_at ? <span>수정 {formatDate(post.updated_at)}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}

"use client";

import { Bot, CircleCheckBig, FileText, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QUOTATION_STATUS_COLORS } from "@/lib/quotation-constants";
import { SortableTableHead, useSortState, sortData } from "@/components/ui/sortable-table-head";
import type { Quotation } from "@/lib/types";

export default function QuotationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { mask } = useMasking();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const { sort, toggle } = useSortState();

  // AI 지침
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPromptLoading, setAiPromptLoading] = useState(false);
  const [aiPromptSaving, setAiPromptSaving] = useState(false);

  // AI 견적 생성
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiTranscript, setAiTranscript] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);

    await supabase.auth.getSession();

    const quotationsRes = await supabase
      .from("quotations")
      .select("*, customers(id, name), projects(id, project_number, name)")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (quotationsRes.error) {
      console.error("견적 목록 조회 실패:", quotationsRes.error.message);
      toast.error("견적 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      setError(true);
    } else {
      // 같은 계열에서 최신 버전만 표시
      const all = quotationsRes.data ?? [];
      const latestByRoot = new Map<string, typeof all[number]>();
      for (const q of all) {
        const rootId = q.parent_id ?? q.id;
        const existing = latestByRoot.get(rootId);
        if (!existing || q.version > existing.version) {
          latestByRoot.set(rootId, q);
        }
      }
      setQuotations(Array.from(latestByRoot.values()));
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openPromptDialog = async () => {
    setPromptDialogOpen(true);
    setAiPromptLoading(true);
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "quotation_ai_prompt")
      .single();
    setAiPrompt(data?.value ?? "");
    setAiPromptLoading(false);
  };

  const handleSavePrompt = async () => {
    setAiPromptSaving(true);
    const { error: err } = await supabase
      .from("system_settings")
      .upsert({ key: "quotation_ai_prompt", value: aiPrompt.trim() }, { onConflict: "key" });
    if (err) {
      console.error("AI 지침 저장 실패:", err.message);
      toast.error("AI 지침 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } else {
      toast.success("견적 AI 지침이 저장되었습니다.");
      setPromptDialogOpen(false);
    }
    setAiPromptSaving(false);
  };

  const handleAiGenerate = async () => {
    if (!aiTranscript.trim()) {
      toast.error("전사록을 입력해주세요.");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch("/api/quotations/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: aiTranscript, context: aiContext }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        console.error("AI 견적 생성 실패:", json.error);
        toast.error("AI 견적 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setAiDialogOpen(false);
      setAiTranscript("");
      setAiContext("");
      toast.success(`AI 견적이 생성되었습니다. (${json.data.quotation_number})`);
      fetchData();
    } catch {
      toast.error("AI 견적 생성 중 오류가 발생했습니다.");
    } finally {
      setAiGenerating(false);
    }
  };

  const filtered = quotations.filter((q) => {
    const keyword = search.trim();
    if (!keyword) return true;
    return (
      q.quotation_number.includes(keyword) ||
      q.recipient_name.includes(keyword) ||
      q.memo?.includes(keyword)
    );
  });

  const sorted = sortData(filtered, sort, (item, key) => {
    switch (key) {
      case "quotation_number": return item.quotation_number;
      case "recipient_name": return item.recipient_name;
      case "quotation_date": return item.quotation_date;
      case "grand_total": return item.grand_total;
      case "status": return item.status;
      default: return null;
    }
  });

  const fmt = (amount: number) => amount.toLocaleString("ko-KR");

  const totalGrand = filtered.reduce((sum, q) => sum + q.grand_total, 0);
  const statusCounts = filtered.reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <PageShell>
      <PageHeader
        title="견적 관리"
        funKey="quotations"
        description="견적 작성과 버전 관리, AI 생성 기능을 같은 패턴으로 읽을 수 있도록 정리했습니다."
        actions={
          <>
            <Button variant="outline" onClick={openPromptDialog}>
              <Bot className="h-4 w-4" />
              AI 지침
            </Button>
            <Button variant="outline" onClick={() => setAiDialogOpen(true)}>
              <Sparkles className="h-4 w-4" />
              AI 견적 생성
            </Button>
            <Button onClick={() => router.push("/dashboard/quotations/new")}>
              <Plus className="h-4 w-4" />
              견적 등록
            </Button>
          </>
        }
      />

      <StatsGrid>
        <StatCard
          label="총 견적"
          value={`${filtered.length}건`}
          description="현재 조건 기준으로 보이는 견적 수"
          icon={FileText}
        />
        <StatCard
          label="총 견적금액"
          value={`${fmt(totalGrand)}원`}
          description="현재 목록의 합계 금액"
          icon={FileText}
          tone="info"
          sensitive="amount"
        />
        <StatCard
          label="작성중"
          value={`${statusCounts["작성중"] || 0}건`}
          description="작성 또는 내부 조정 중인 견적"
          icon={Bot}
          tone="warning"
        />
        <StatCard
          label="수락"
          value={`${statusCounts["수락"] || 0}건`}
          description="고객이 수락한 견적"
          icon={CircleCheckBig}
          tone="success"
        />
      </StatsGrid>

      <PageToolbar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="견적번호, 수신자명, 메모를 검색하세요"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full sm:max-w-sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{sorted.length}건 표시 중</span>
            {search ? (
              <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                초기화
              </Button>
            ) : null}
          </div>
        </div>
      </PageToolbar>

      {loading ? (
        <LoadingState
          title="견적 목록을 불러오는 중입니다."
          description="최신 버전 기준으로 견적을 정리하고 있습니다."
        />
      ) : error ? (
        <ErrorState
          description="견적 데이터를 다시 불러오지 못했습니다."
          onRetry={() => void fetchData()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "조건에 맞는 견적이 없습니다." : "등록된 견적이 없습니다."}
          description={
            search
              ? "검색어를 조정하거나 초기화해 보세요."
              : "첫 견적을 등록하면 이 화면에서 버전과 상태를 추적할 수 있습니다."
          }
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                검색 초기화
              </Button>
            ) : (
              <Button size="sm" onClick={() => router.push("/dashboard/quotations/new")}>
                <Plus className="h-4 w-4" />
                견적 등록
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {sorted.map((q) => (
              <button
                key={q.id}
                className="surface-subtle p-3 sm:p-4 text-left transition-transform hover:-translate-y-0.5"
                onClick={() => router.push(`/dashboard/quotations/${q.id}`)}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{q.quotation_number}</p>
                    <p className="text-sm text-muted-foreground">{mask("customer_name", q.recipient_name)}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QUOTATION_STATUS_COLORS[q.status] || ""}`}
                  >
                    {q.status}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>견적일: {q.quotation_date}</p>
                  <p>합계: {mask("amount", `${fmt(q.grand_total)}원`)}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="surface-panel hidden overflow-hidden p-1 md:block">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="quotation_number" currentSort={sort} onSort={toggle}>
                    견적번호
                  </SortableTableHead>
                  <SortableTableHead sortKey="recipient_name" currentSort={sort} onSort={toggle}>
                    수신자
                  </SortableTableHead>
                  <SortableTableHead sortKey="quotation_date" currentSort={sort} onSort={toggle}>
                    견적일
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="grand_total"
                    currentSort={sort}
                    onSort={toggle}
                    className="text-right"
                  >
                    합계금액
                  </SortableTableHead>
                  <SortableTableHead sortKey="status" currentSort={sort} onSort={toggle}>
                    상태
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/quotations/${q.id}`)}
                  >
                    <TableCell className="max-w-[160px] truncate font-medium">{q.quotation_number}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{mask("customer_name", q.recipient_name)}</TableCell>
                    <TableCell>{q.quotation_date}</TableCell>
                    <TableCell className="text-right">{mask("amount", fmt(q.grand_total))}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QUOTATION_STATUS_COLORS[q.status] || ""}`}
                      >
                        {q.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        </>
      )}

      {/* AI 지침 다이얼로그 */}
      <Dialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>견적 AI 지침</DialogTitle>
            <DialogDescription>
              AI 견적 자동생성 시 사용할 지침을 설정합니다. 비워두면 기본 지침이 사용됩니다.
            </DialogDescription>
          </DialogHeader>
          {aiPromptLoading ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={12}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder={`예시:\n당신은 소프트웨어 개발 견적서를 작성하는 전문가입니다.\n미팅 전사록과 맥락 정보를 바탕으로 견적서 데이터를 JSON 형식으로 생성합니다.\n\n규칙:\n- 품목(items)은 구체적인 개발 작업 단위로 분리합니다.\n- 단가는 한국소프트웨어산업협회 노임단가를 참고합니다.\n- 단위는 "일" 또는 "식"을 사용합니다.`}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSavePrompt} disabled={aiPromptLoading || aiPromptSaving}>
              {aiPromptSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 견적 생성 다이얼로그 */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 견적 생성</DialogTitle>
            <DialogDescription>
              미팅 전사록과 추가 맥락을 입력하면 AI가 견적 데이터를 자동으로 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-transcript">미팅 전사록 *</Label>
              <textarea
                id="ai-transcript"
                value={aiTranscript}
                onChange={(e) => setAiTranscript(e.target.value)}
                rows={10}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="고객과의 미팅 전사록을 붙여넣으세요..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-context">추가 맥락 (선택)</Label>
              <textarea
                id="ai-context"
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="프로젝트 배경, 기술 스택, 특이사항 등..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)} disabled={aiGenerating}>
              취소
            </Button>
            <Button onClick={handleAiGenerate} disabled={!aiTranscript.trim() || aiGenerating}>
              {aiGenerating ? "생성 중..." : "견적 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

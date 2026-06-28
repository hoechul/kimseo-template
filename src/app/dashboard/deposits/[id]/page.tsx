"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { DepositDialog } from "@/components/deposit-dialog";
import { Sparkles, Loader2 } from "lucide-react";
import type { Deposit, DepositInsert } from "@/lib/types";

interface AiMatchSuggestion {
  revenue_id: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  revenue_title: string;
  revenue_amount: number;
  project_name: string | null;
}

export default function DepositDetailPage() {
  const params = useParams();
  const router = useRouter();
  const depositId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AiMatchSuggestion[]>([]);
  const [linking, setLinking] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("deposits")
      .select("*, revenues(id, title, total_amount, projects(name, client))")
      .eq("id", depositId)
      .single();

    if (error) { console.error("입금 정보 조회 실패:", error.message); toast.error("입금 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }
    setDeposit(data);

    setLoading(false);
  }, [supabase, depositId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!confirm("이 입금 항목을 삭제하시겠습니까?")) return;
    setDeleting(true);
    const { error } = await supabase.from("deposits").delete().eq("id", depositId);
    if (error) {
      console.error("입금 삭제 실패:", error.message);
      toast.error("입금 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setDeleting(false);
      return;
    }
    toast.success("입금 항목이 삭제되었습니다.");
    sendLog("DELETE_DEPOSIT", `입금 삭제: ${deposit?.depositor_name}`, { resource: "deposit", resource_id: depositId });
    router.push("/dashboard/deposits");
  };

  const handleSave = async (data: DepositInsert) => {
    const cleaned = {
      ...data,
      bank_name: data.bank_name || null,
      account_alias: data.account_alias || null,
      revenue_id: data.revenue_id || null,
      memo: data.memo || null,
      raw_message: data.raw_message || null,
    };

    const { error } = await supabase
      .from("deposits")
      .update(cleaned)
      .eq("id", depositId);
    if (error) {
      console.error("입금 수정 실패:", error.message);
      toast.error("입금 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (cleaned.revenue_id && cleaned.revenue_id !== deposit?.revenue_id) {
      await supabase
        .from("revenues")
        .update({ is_paid: true, paid_date: cleaned.deposit_date ?? null })
        .eq("id", cleaned.revenue_id);
    }

    await fetchData();
    toast.success("입금 정보가 수정되었습니다.");
  };

  const handleAiMatch = async () => {
    setAiLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/deposits/${depositId}/ai-match`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "AI 매칭 실패");
      setSuggestions(data.suggestions ?? []);
      if (!data.suggestions?.length) toast.info("매칭할 수 있는 매출이 없습니다.");
    } catch (e) {
      console.error("AI 매칭 실패:", e instanceof Error ? e.message : String(e));
      toast.error("AI 매칭에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
    setAiLoading(false);
  };

  const handleLinkRevenue = async (revenueId: string) => {
    setLinking(revenueId);
    const { error } = await supabase
      .from("deposits")
      .update({ revenue_id: revenueId })
      .eq("id", depositId);
    if (error) {
      console.error("매출 연결 실패:", error.message);
      toast.error("매출 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } else {
      await supabase
        .from("revenues")
        .update({ is_paid: true, paid_date: deposit?.deposit_date ?? null })
        .eq("id", revenueId);
      toast.success("매출이 연결되었습니다.");
      setSuggestions([]);
      await fetchData();
    }
    setLinking(null);
  };

  const fmt = (amount: number) => amount.toLocaleString("ko-KR");

  if (loading) {
    return <LoadingState title="입금 정보를 불러오는 중입니다." />;
  }

  if (!deposit) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">입금 항목을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/deposits")}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/deposits"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              입금관리
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">{mask("name", deposit.depositor_name)}</span>
          </div>
          <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">{mask("name", deposit.depositor_name)}</h3>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {!deposit.revenue_id && (
            <Button variant="outline" onClick={handleAiMatch} disabled={aiLoading} className="flex-1 sm:flex-none">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI 매칭
            </Button>
          )}
          <Button variant="outline" onClick={() => setDialogOpen(true)} className="flex-1 sm:flex-none">
            수정
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1 sm:flex-none">
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">입금액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{mask("amount", `${fmt(deposit.amount)}원`)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">출처</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={deposit.source === "webhook" ? "default" : "outline"} className="text-sm">
              {deposit.source === "webhook" ? "자동" : "수기"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">매출연결</CardTitle>
          </CardHeader>
          <CardContent>
            {deposit.revenues ? (
              <Link
                href={`/dashboard/revenues/${deposit.revenue_id}`}
                className="text-primary hover:underline"
              >
                {(() => { const p = deposit.revenues!.projects; const prefix = p?.client ?? p?.name; const label = prefix ? `${mask("customer_name", prefix)} / ${mask("title", deposit.revenues!.title)}` : mask("title", deposit.revenues!.title); return label; })()} ({mask("amount", `${fmt(deposit.revenues.total_amount)}원`)})
              </Link>
            ) : (
              <span className="text-muted-foreground">미연결</span>
            )}
          </CardContent>
        </Card>
      </div>

      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI 매칭 추천
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.revenue_id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={s.confidence === "high" ? "default" : "outline"}
                      className={
                        s.confidence === "high"
                          ? "bg-green-600"
                          : s.confidence === "medium"
                            ? "border-yellow-500 text-yellow-600"
                            : ""
                      }
                    >
                      {s.confidence === "high" ? "높음" : s.confidence === "medium" ? "보통" : "낮음"}
                    </Badge>
                    <span className="text-sm font-medium">{mask("title", s.revenue_title)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mask("amount", `${fmt(s.revenue_amount)}원`)}{s.project_name ? ` · ${mask("title", s.project_name)}` : ""} — {s.reason}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleLinkRevenue(s.revenue_id)}
                  disabled={linking === s.revenue_id}
                >
                  {linking === s.revenue_id ? "연결 중..." : "연결"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">상세 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted-foreground">입금일</span>
            <span>{deposit.deposit_date}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted-foreground">입금자명</span>
            <span>{mask("name", deposit.depositor_name)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted-foreground">은행</span>
            <span>{deposit.bank_name || "-"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted-foreground">통장별칭</span>
            <span>{deposit.account_alias || "-"}</span>
          </div>
          {deposit.raw_message && (
            <div className="flex items-start gap-2 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">원본메시지</span>
              <span className="whitespace-pre-wrap rounded-md bg-muted/50 px-2 py-1 text-xs font-mono">
                {deposit.raw_message}
              </span>
            </div>
          )}
          {deposit.memo && (
            <div className="flex items-start gap-2 text-sm">
              <span className="w-24 text-muted-foreground">메모</span>
              <span>{deposit.memo}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <DepositDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        deposit={deposit}
        onSave={handleSave}
      />
    </div>
  );
}

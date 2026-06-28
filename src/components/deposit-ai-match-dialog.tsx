"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";

interface AutoMatchItem {
  deposit_id: string;
  depositor_name: string;
  amount: number;
  deposit_date: string;
  revenue_id: string;
  revenue_title: string;
  revenue_amount: number;
  project_name: string | null;
  match_type: "exact_name_single" | "exact_name_amount";
}

interface AiSuggestion {
  revenue_id: string;
  revenue_title: string;
  revenue_amount: number;
  project_name: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

interface AiMatchItem {
  deposit_id: string;
  depositor_name: string;
  amount: number;
  deposit_date: string;
  suggestions: AiSuggestion[];
}

interface UnmatchedItem {
  deposit_id: string;
  depositor_name: string;
  amount: number;
  deposit_date: string;
}

interface MatchResponse {
  ok: true;
  auto_matched: AutoMatchItem[];
  ai_suggestions: AiMatchItem[];
  unmatched: UnmatchedItem[];
  stats: { total: number; auto: number; ai: number; unmatched: number };
}

interface DepositAiMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}

type RunState = "idle" | "loading" | "done";

export function DepositAiMatchDialog({
  open,
  onOpenChange,
  onLinked,
}: DepositAiMatchDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<RunState>("idle");
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [linkedKeys, setLinkedKeys] = useState<Set<string>>(new Set());
  const [confidenceFilter, setConfidenceFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");

  useEffect(() => {
    if (open) {
      setState("idle");
      setResult(null);
      setLinkedKeys(new Set());
      setConfidenceFilter("all");
      void runMatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runMatch = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/deposits/ai-match-batch", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "AI 매칭 실패");
      }
      setResult(data);
      setState("done");

      if (data.auto_matched.length > 0) {
        toast.success(
          `자동 연결 ${data.auto_matched.length}건 완료. AI 후보 ${data.ai_suggestions.length}건을 확인해주세요.`
        );
        onLinked();
      } else if (data.ai_suggestions.length === 0) {
        toast.info("매칭할 수 있는 미연결 입금이 없습니다.");
      }
    } catch (error) {
      console.error(
        "AI 일괄 매칭 실패:",
        error instanceof Error ? error.message : String(error)
      );
      toast.error("AI 매칭에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setState("idle");
    }
  };

  const handleLink = async (
    depositId: string,
    depositDate: string,
    suggestion: AiSuggestion
  ) => {
    const key = `${depositId}:${suggestion.revenue_id}`;
    setLinkingKey(key);

    const { error: depositError } = await supabase
      .from("deposits")
      .update({ revenue_id: suggestion.revenue_id })
      .eq("id", depositId);

    if (depositError) {
      console.error("매출 연결 실패:", depositError.message);
      toast.error("매출 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setLinkingKey(null);
      return;
    }

    await supabase
      .from("revenues")
      .update({ is_paid: true, paid_date: depositDate })
      .eq("id", suggestion.revenue_id);

    sendLog(
      "LINK_DEPOSIT_REVENUE",
      `AI 매칭 연결: ${suggestion.revenue_title}`,
      { resource: "deposit", resource_id: depositId }
    );

    toast.success("매출이 연결되었습니다.");
    setLinkedKeys((prev) => {
      const next = new Set(prev);
      next.add(depositId);
      return next;
    });
    setLinkingKey(null);
    onLinked();
  };

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  const confidenceLabel = (c: AiSuggestion["confidence"]) =>
    c === "high" ? "높음" : c === "medium" ? "보통" : "낮음";

  const confidenceClass = (c: AiSuggestion["confidence"]) =>
    c === "high"
      ? "bg-green-600 text-white"
      : c === "medium"
        ? "border-yellow-500 text-yellow-700"
        : "border-muted-foreground/40 text-muted-foreground";

  const confidenceOrder: Record<AiSuggestion["confidence"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  const filteredAi = useMemo(() => {
    if (!result) return [];
    if (confidenceFilter === "all") return result.ai_suggestions;
    return result.ai_suggestions
      .map((item) => ({
        ...item,
        suggestions: item.suggestions.filter(
          (s) => s.confidence === confidenceFilter
        ),
      }))
      .filter((item) => item.suggestions.length > 0);
  }, [result, confidenceFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            입금 · 매출 AI 일괄 매칭
          </DialogTitle>
          <DialogDescription>
            입금자명과 매출 고객명이 정확히 일치하는 건은 자동으로 연결하고,
            일치하지 않는 건은 유사도가 높은 후보를 추천합니다.
          </DialogDescription>
        </DialogHeader>

        <div>
            {state === "loading" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  미연결 입금과 미수 매출을 분석하고 있습니다.
                </p>
                <p className="text-xs text-muted-foreground">
                  유사한 이름을 찾는 동안 잠시만 기다려주세요.
                </p>
              </div>
            ) : result ? (
              <div className="space-y-6">
                {/* 요약 */}
                <div className="grid grid-cols-3 gap-3">
                  <SummaryCard
                    label="자동 연결"
                    value={result.stats.auto}
                    tone="positive"
                  />
                  <SummaryCard
                    label="AI 추천"
                    value={result.stats.ai}
                    tone="brand"
                  />
                  <SummaryCard
                    label="후보 없음"
                    value={result.stats.unmatched}
                    tone="muted"
                  />
                </div>

                {/* 자동 연결 결과 */}
                {result.auto_matched.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <h4 className="text-sm font-semibold">
                        자동으로 연결된 입금 ({result.auto_matched.length}건)
                      </h4>
                    </div>
                    <div className="space-y-2">
                      {result.auto_matched.map((item) => (
                        <div
                          key={item.deposit_id}
                          className="rounded-lg border border-green-200 bg-green-50/60 p-3 text-sm dark:border-green-900/40 dark:bg-green-900/10"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {item.depositor_name}{" "}
                                <span className="text-muted-foreground">
                                  ({fmt(item.amount)}원 · {item.deposit_date})
                                </span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                →{" "}
                                <span className="font-medium text-foreground">
                                  {item.project_name
                                    ? `${item.project_name} / `
                                    : ""}
                                  {item.revenue_title}
                                </span>{" "}
                                ({fmt(item.revenue_amount)}원)
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-green-400 bg-white text-green-700"
                            >
                              {item.match_type === "exact_name_amount"
                                ? "이름+금액 일치"
                                : "이름 정확 일치"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* AI 추천 */}
                {result.ai_suggestions.length > 0 ? (
                  <section className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold">
                          AI 추천 매칭 ({result.ai_suggestions.length}건)
                        </h4>
                      </div>
                      <div className="flex items-center gap-1">
                        {(["all", "high", "medium", "low"] as const).map(
                          (filter) => (
                            <Button
                              key={filter}
                              variant={
                                confidenceFilter === filter
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setConfidenceFilter(filter)}
                            >
                              {filter === "all"
                                ? "전체"
                                : filter === "high"
                                  ? "높음"
                                  : filter === "medium"
                                    ? "보통"
                                    : "낮음"}
                            </Button>
                          )
                        )}
                      </div>
                    </div>

                    {filteredAi.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        선택한 신뢰도 구간의 추천이 없습니다.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredAi.map((item) => {
                          const alreadyLinked = linkedKeys.has(item.deposit_id);
                          const sorted = [...item.suggestions].sort(
                            (a, b) =>
                              confidenceOrder[a.confidence] -
                              confidenceOrder[b.confidence]
                          );
                          return (
                            <div
                              key={item.deposit_id}
                              className={`rounded-lg border p-3 ${
                                alreadyLinked ? "opacity-60" : ""
                              }`}
                            >
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">
                                  {item.depositor_name}
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  {fmt(item.amount)}원 · {item.deposit_date}
                                </span>
                                {alreadyLinked ? (
                                  <Badge
                                    variant="outline"
                                    className="border-green-400 bg-green-50 text-green-700"
                                  >
                                    연결됨
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="space-y-2">
                                {sorted.map((s) => {
                                  const key = `${item.deposit_id}:${s.revenue_id}`;
                                  return (
                                    <div
                                      key={key}
                                      className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                      <div className="flex-1 space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={confidenceClass(
                                              s.confidence
                                            )}
                                          >
                                            {confidenceLabel(s.confidence)}
                                          </Badge>
                                          <span className="text-sm font-medium">
                                            {s.project_name
                                              ? `${s.project_name} / `
                                              : ""}
                                            {s.revenue_title}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {fmt(s.revenue_amount)}원 — {s.reason}
                                        </p>
                                      </div>
                                      <Button
                                        size="sm"
                                        disabled={
                                          alreadyLinked ||
                                          linkingKey === key
                                        }
                                        onClick={() =>
                                          handleLink(
                                            item.deposit_id,
                                            item.deposit_date,
                                            s
                                          )
                                        }
                                      >
                                        {linkingKey === key
                                          ? "연결 중..."
                                          : alreadyLinked
                                            ? "완료"
                                            : "연결"}
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ) : null}

                {/* 매칭 불가 */}
                {result.unmatched.length > 0 ? (
                  <section className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      후보가 없는 입금 ({result.unmatched.length}건)
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {result.unmatched.map((item) => (
                        <div
                          key={item.deposit_id}
                          className="rounded-lg border border-dashed p-2 text-xs"
                        >
                          <p className="font-medium">{item.depositor_name}</p>
                          <p className="text-muted-foreground">
                            {fmt(item.amount)}원 · {item.deposit_date}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {result.stats.total === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    연결이 필요한 미연결 입금이 없습니다.
                  </p>
                ) : null}
              </div>
            ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={state === "loading"}
          >
            닫기
          </Button>
          <Button
            onClick={() => void runMatch()}
            disabled={state === "loading"}
          >
            {state === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> 분석 중...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> 다시 매칭
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "brand" | "muted";
}) {
  const toneClass =
    tone === "positive"
      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/10 dark:text-green-200"
      : tone === "brand"
        ? "border-primary/30 bg-primary/5 text-primary"
        : "border-border bg-muted/40 text-muted-foreground";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-xs">{label}</p>
      <p className="text-xl font-semibold">{value}건</p>
    </div>
  );
}

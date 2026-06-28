"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import { formatAmountInMan } from "@/lib/utils";
import type { CardTransaction, CorporateCard } from "@/lib/types";
import { CARD_TRANSACTION_STATUS_LABEL } from "@/lib/types";

type CardWithHolder = CorporateCard & { holder?: { id: string; name: string } | null };

function formatApprovedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CorporateCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [card, setCard] = useState<CardWithHolder | null>(null);
  const [transactions, setTransactions] = useState<CardTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCard = useCallback(async () => {
    setLoading(true);
    await supabase.auth.getSession();
    const [cardRes, txRes] = await Promise.all([
      supabase
        .from("corporate_cards")
        .select("*, holder:employees(id, name)")
        .eq("id", cardId)
        .single(),
      supabase
        .from("card_transactions")
        .select("*")
        .eq("card_id", cardId)
        .order("approved_at", { ascending: false })
        .limit(50),
    ]);

    if (cardRes.error) {
      console.error("카드 조회 실패:", cardRes.error.message);
      toast.error("카드 정보를 불러오지 못했습니다.");
      setCard(null);
    } else {
      setCard(cardRes.data as CardWithHolder);
    }
    setTransactions((txRes.data ?? []) as CardTransaction[]);
    setLoading(false);
  }, [supabase, cardId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCard();
  }, [fetchCard]);

  const handleDelete = async () => {
    if (!card) return;
    if (!confirm(`'${card.last4}' 카드를 삭제하시겠습니까?\n연결된 거래 내역은 보존되지만 카드 정보 매핑이 해제됩니다.`)) {
      return;
    }
    const { error } = await supabase.from("corporate_cards").delete().eq("id", cardId);
    if (error) {
      console.error("카드 삭제 실패:", error.message);
      toast.error("삭제에 실패했습니다.");
      return;
    }
    sendLog("DELETE_CORPORATE_CARD", `법인카드 삭제: ${card.last4}`, {
      resource: "corporate_card",
      resource_id: cardId,
    });
    toast.success("법인카드가 삭제되었습니다.");
    router.push("/dashboard/cards");
  };

  if (loading) return <LoadingState title="카드 정보를 불러오는 중..." />;
  if (!card) {
    return (
      <PageShell>
        <p className="text-muted-foreground">카드를 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/cards")}>
          목록으로 돌아가기
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "법인카드", href: "/dashboard/cards" },
          { label: card.last4 },
        ]}
        title={card.last4}
        description={`${card.issuer ?? "카드사 미지정"}${card.holder?.name ? ` · ${mask("name", card.holder.name)}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/cards">
                <ArrowLeft className="h-4 w-4" />
                목록
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/cards/${cardId}/edit`}>
                <Pencil className="h-4 w-4" />
                수정
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
              삭제
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border border-border/70 bg-background/40 p-6">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">끝 4자리</dt>
            <dd className="mt-1 font-mono">{card.last4}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">카드사</dt>
            <dd className="mt-1">{card.issuer ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">사용 직원</dt>
            <dd className="mt-1">{card.holder?.name ? mask("name", card.holder.name) : "미지정"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">상태</dt>
            <dd className="mt-1">
              {card.is_active ? (
                <Badge variant="default">활성</Badge>
              ) : (
                <Badge variant="secondary">비활성</Badge>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">메모</dt>
            <dd className="mt-1 whitespace-pre-wrap">{card.memo ?? "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/40">
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold">최근 거래 내역</h3>
            <p className="text-xs text-muted-foreground">최대 50건. 전체는 카드사용내역 메뉴에서 확인.</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">합계</p>
            <p className="font-mono font-medium">
              {formatAmountInMan(transactions.reduce((s, t) => s + t.amount, 0))}
            </p>
          </div>
        </div>
        {transactions.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">아직 매칭된 거래가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">시각</th>
                <th className="px-4 py-2 font-medium">가맹점</th>
                <th className="px-4 py-2 font-medium text-right">금액</th>
                <th className="px-4 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-mono text-xs">{formatApprovedAt(tx.approved_at)}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/card-transactions/${tx.id}`}
                      className="hover:text-primary"
                    >
                      {tx.merchant ? mask("customer_name", tx.merchant) : "(가맹점 미상)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{mask("amount", `${tx.amount.toLocaleString("ko-KR")}원`)}</td>
                  <td className="px-4 py-2">
                    <Badge variant={tx.status === "confirmed" ? "default" : tx.status === "ignored" ? "outline" : "secondary"}>
                      {CARD_TRANSACTION_STATUS_LABEL[tx.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}

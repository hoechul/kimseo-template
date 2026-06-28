"use client";

import { CreditCard, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CorporateCardDialog } from "@/components/corporate-card-dialog";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { CorporateCard, CorporateCardInsert, Employee } from "@/lib/types";

type CardRow = CorporateCard & { holder?: { id: string; name: string } | null };

export default function CorporateCardsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [employees, setEmployees] = useState<Pick<Employee, "id" | "name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    await supabase.auth.getSession();

    const [cardRes, empRes] = await Promise.all([
      supabase
        .from("corporate_cards")
        .select("*, holder:employees(id, name)")
        .order("is_active", { ascending: false })
        .order("last4"),
      supabase.from("employees").select("id, name").order("name"),
    ]);

    if (cardRes.error) {
      console.error("법인카드 목록 조회 실패:", cardRes.error.message);
      toast.error("법인카드 목록 조회에 실패했습니다.");
      setError(true);
      setLoading(false);
      return;
    }

    setCards((cardRes.data ?? []) as CardRow[]);
    setEmployees((empRes.data ?? []) as Pick<Employee, "id" | "name">[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const handleSave = async (data: CorporateCardInsert) => {
    const { data: inserted, error } = await supabase
      .from("corporate_cards")
      .insert(data)
      .select("id, last4")
      .single();

    if (error) {
      console.error("법인카드 등록 실패:", error.message);
      toast.error(`등록 실패: ${error.message}`);
      return;
    }

    sendLog("CREATE_CORPORATE_CARD", `법인카드 등록: ${data.last4}`, {
      resource: "corporate_card",
      resource_id: inserted.id,
    });
    toast.success("법인카드가 등록되었습니다.");
    await fetchData();
  };

  const activeCount = cards.filter((c) => c.is_active).length;

  return (
    <PageShell>
      <PageHeader
        title="법인카드"
        description="법인카드 별칭과 사용 직원을 등록하면 SMS 거래 내역과 자동으로 매핑됩니다."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            카드 등록
          </Button>
        }
      />

      <StatsGrid className="xl:grid-cols-2">
        <StatCard label="전체 카드" value={`${cards.length}장`} icon={CreditCard} />
        <StatCard
          label="활성 카드"
          value={`${activeCount}장`}
          description="비활성 카드는 SMS 매칭에서 제외됩니다."
          icon={CreditCard}
          tone="success"
        />
      </StatsGrid>

      {loading ? (
        <LoadingState label="법인카드 목록을 불러오는 중..." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchData()} />
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            등록된 법인카드가 없습니다. 오른쪽 상단 &quot;카드 등록&quot; 버튼을 눌러 추가하세요.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-background/40">
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">끝 4자리</th>
                <th className="px-4 py-3 font-medium">카드사</th>
                <th className="px-4 py-3 font-medium">사용 직원</th>
                <th className="px-4 py-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono">
                    <Link
                      href={`/dashboard/cards/${card.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {card.last4}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{card.issuer ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {card.holder?.name ? mask("name", card.holder.name) : "미지정"}
                  </td>
                  <td className="px-4 py-3">
                    {card.is_active ? (
                      <Badge variant="default">활성</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CorporateCardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employees={employees}
        onSave={handleSave}
      />
    </PageShell>
  );
}

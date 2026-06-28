"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { CorporateCard, CorporateCardUpdate, Employee } from "@/lib/types";

export default function EditCorporateCardPage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [card, setCard] = useState<CorporateCard | null>(null);
  const [employees, setEmployees] = useState<Pick<Employee, "id" | "name">[]>([]);
  const [form, setForm] = useState<CorporateCardUpdate>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await supabase.auth.getSession();
    const [cardRes, empRes] = await Promise.all([
      supabase.from("corporate_cards").select("*").eq("id", cardId).single(),
      supabase.from("employees").select("id, name").order("name"),
    ]);

    if (cardRes.error) {
      toast.error("카드 정보를 불러오지 못했습니다.");
      setCard(null);
    } else {
      const c = cardRes.data as CorporateCard;
      setCard(c);
      setForm({
        last4: c.last4,
        holder_employee_id: c.holder_employee_id,
        issuer: c.issuer,
        is_active: c.is_active,
        memo: c.memo,
      });
    }
    setEmployees((empRes.data ?? []) as Pick<Employee, "id" | "name">[]);
    setLoading(false);
  }, [supabase, cardId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.last4 || !/^\d{4}$/.test(form.last4)) {
      alert("카드 끝 4자리는 숫자 4자리여야 합니다.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("corporate_cards").update(form).eq("id", cardId);
    setSaving(false);
    if (error) {
      console.error("카드 수정 실패:", error.message);
      toast.error(`수정 실패: ${error.message}`);
      return;
    }
    sendLog("UPDATE_CORPORATE_CARD", `법인카드 수정: ${form.last4}`, {
      resource: "corporate_card",
      resource_id: cardId,
    });
    toast.success("카드 정보가 수정되었습니다.");
    router.push(`/dashboard/cards/${cardId}`);
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
          { label: card.last4, href: `/dashboard/cards/${cardId}` },
          { label: "수정" },
        ]}
        title="법인카드 수정"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/dashboard/cards/${cardId}`}>
              <ArrowLeft className="h-4 w-4" />
              상세로
            </Link>
          </Button>
        }
      />

      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl border border-border/70 bg-background/40 p-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="last4">카드 끝 4자리 *</Label>
            <Input
              id="last4"
              value={form.last4 ?? ""}
              onChange={(e) =>
                setForm({ ...form, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })
              }
              maxLength={4}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issuer">카드사</Label>
            <Input
              id="issuer"
              value={form.issuer ?? ""}
              onChange={(e) => setForm({ ...form, issuer: e.target.value || null })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="holder">사용 직원</Label>
          <select
            id="holder"
            value={form.holder_employee_id ?? ""}
            onChange={(e) =>
              setForm({ ...form, holder_employee_id: e.target.value || null })
            }
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">미지정</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="memo">메모</Label>
          <Input
            id="memo"
            value={form.memo ?? ""}
            onChange={(e) => setForm({ ...form, memo: e.target.value || null })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="is_active"
            type="checkbox"
            checked={form.is_active ?? true}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-4 w-4"
          />
          <Label htmlFor="is_active" className="cursor-pointer">
            활성 카드 (SMS 매칭 대상)
          </Label>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/cards/${cardId}`)}
          >
            취소
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중..." : "수정"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

"use client";

import { ArrowLeft, Pencil, Plus, Repeat, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { RecurringExpenseDialog } from "@/components/recurring-expense-dialog";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
  StatCard,
  StatsGrid,
} from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMasking } from "@/components/masking-provider";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import { formatAmountInMan } from "@/lib/utils";
import type {
  ExpenseType,
  RecurringExpense,
  RecurringExpenseInsert,
} from "@/lib/types";

type Row = RecurringExpense & {
  expense_types?: { id: string; name: string } | null;
};

export default function RecurringExpensesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringExpense | null>(null);
  const { mask } = useMasking();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    await supabase.auth.getSession();

    const [tplRes, typeRes] = await Promise.all([
      supabase
        .from("recurring_expenses")
        .select("*, expense_types(id, name)")
        .order("is_active", { ascending: false })
        .order("day_of_month"),
      supabase.from("expense_types").select("*").order("sort_order"),
    ]);

    if (tplRes.error) {
      console.error("반복 매입 조회 실패:", tplRes.error.message);
      toast.error("반복 매입 목록을 불러오지 못했습니다.");
      setError(true);
      setLoading(false);
      return;
    }
    setRows((tplRes.data ?? []) as Row[]);
    setExpenseTypes((typeRes.data ?? []) as ExpenseType[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const handleSave = async (data: RecurringExpenseInsert) => {
    if (editTarget) {
      const { error: err } = await supabase
        .from("recurring_expenses")
        .update(data)
        .eq("id", editTarget.id);
      if (err) {
        toast.error(`수정 실패: ${err.message}`);
        return;
      }
      sendLog("UPDATE_RECURRING_EXPENSE", `반복 매입 수정: ${data.title}`, {
        resource: "recurring_expense",
        resource_id: editTarget.id,
      });
      toast.success("수정되었습니다.");
    } else {
      const { data: inserted, error: err } = await supabase
        .from("recurring_expenses")
        .insert(data)
        .select("id")
        .single();
      if (err) {
        toast.error(`등록 실패: ${err.message}`);
        return;
      }
      sendLog("CREATE_RECURRING_EXPENSE", `반복 매입 등록: ${data.title}`, {
        resource: "recurring_expense",
        resource_id: inserted.id,
      });
      toast.success("반복 매입이 등록되었습니다.");
    }
    setEditTarget(null);
    await fetchData();
  };

  const handleToggleActive = async (row: Row) => {
    const { error: err } = await supabase
      .from("recurring_expenses")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (err) {
      toast.error(`상태 변경 실패: ${err.message}`);
      return;
    }
    toast.success(row.is_active ? "비활성화했습니다." : "활성화했습니다.");
    await fetchData();
  };

  const handleDelete = async (row: Row) => {
    if (!confirm(`'${row.title}' 템플릿을 삭제하시겠습니까?\n이미 자동 생성된 매입은 그대로 남습니다.`)) {
      return;
    }
    const { error: err } = await supabase.from("recurring_expenses").delete().eq("id", row.id);
    if (err) {
      toast.error(`삭제 실패: ${err.message}`);
      return;
    }
    sendLog("DELETE_RECURRING_EXPENSE", `반복 매입 삭제: ${row.title}`, {
      resource: "recurring_expense",
      resource_id: row.id,
    });
    toast.success("삭제되었습니다.");
    await fetchData();
  };

  const activeRows = rows.filter((r) => r.is_active);
  const monthlyTotal = activeRows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "매입관리", href: "/dashboard/expenses" },
          { label: "반복 매입 템플릿" },
        ]}
        title="반복 매입 템플릿"
        description="임대료·관리비·차량 렌트료 등 매월 고정 매입을 등록하면 매일 자동으로 그 달의 매입 항목이 생성됩니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/expenses">
                <ArrowLeft className="h-4 w-4" />
                매입관리
              </Link>
            </Button>
            <Button
              onClick={() => {
                setEditTarget(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              템플릿 등록
            </Button>
          </div>
        }
      />

      <StatsGrid className="xl:grid-cols-2">
        <StatCard label="활성 템플릿" value={`${activeRows.length}개`} icon={Repeat} />
        <StatCard
          label="매월 자동 발생 합계"
          value={`${monthlyTotal.toLocaleString("ko-KR")}원`}
          mobileValue={formatAmountInMan(monthlyTotal)}
          description="활성 템플릿의 월 발생액 합계"
          icon={Repeat}
          tone="info"
          sensitive="amount"
        />
      </StatsGrid>

      {loading ? (
        <LoadingState label="반복 매입 템플릿을 불러오는 중..." />
      ) : error ? (
        <ErrorState onRetry={() => void fetchData()} />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            등록된 반복 매입이 없습니다. 위 &quot;템플릿 등록&quot; 버튼으로 추가하세요.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/40">
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">유형</th>
                <th className="px-4 py-3 font-medium">매입처</th>
                <th className="px-4 py-3 font-medium text-right">금액</th>
                <th className="px-4 py-3 font-medium">매월</th>
                <th className="px-4 py-3 font-medium">기간</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">최종 생성</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{mask("title", row.title)}</td>
                  <td className="px-4 py-3">
                    {row.expense_types?.name ? (
                      <Badge variant="secondary">{row.expense_types.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.vendor_name ? mask("customer_name", row.vendor_name) : "-"}</td>
                  <td className="px-4 py-3 text-right font-mono">{mask("amount", `${row.amount.toLocaleString("ko-KR")}원`)}</td>
                  <td className="px-4 py-3">{row.day_of_month}일</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.start_date} ~ {row.end_date ?? "무기한"}
                  </td>
                  <td className="px-4 py-3">
                    {row.is_active ? (
                      <Badge variant="default">활성</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.last_generated_month ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={row.is_active ? "비활성화" : "활성화"}
                        onClick={() => handleToggleActive(row)}
                      >
                        {row.is_active ? (
                          <ToggleRight className="h-4 w-4" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="수정"
                        onClick={() => {
                          setEditTarget(row);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="삭제"
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecurringExpenseDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
        template={editTarget}
        expenseTypes={expenseTypes}
        onSave={handleSave}
      />
    </PageShell>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  PageHeader,
  PageShell,
} from "@/components/page-shell";
import { useMasking } from "@/components/masking-provider";
import { Button } from "@/components/ui/button";
import {
  ExpenseDetailContent,
  type ExpenseWithVendor,
} from "@/components/expenses/expense-detail-content";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseStatusHistory } from "@/lib/types";

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { mask } = useMasking();

  const [expense, setExpense] = useState<ExpenseWithVendor | null>(null);
  const [history, setHistory] = useState<ExpenseStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    await supabase.auth.getSession();
    const [expenseRes, historyRes] = await Promise.all([
      supabase
        .from("expenses")
        .select(
          "*, expense_types(id, name), projects(id, project_number, name), vendor:customers!expenses_vendor_id_fkey(id, name)"
        )
        .eq("id", expenseId)
        .maybeSingle(),
      supabase
        .from("expense_status_history")
        .select("*")
        .eq("expense_id", expenseId)
        .order("created_at", { ascending: false }),
    ]);
    if (expenseRes.error) {
      console.error("매입 조회 실패:", expenseRes.error.message);
      toast.error("매입 정보를 불러오지 못했습니다.");
      setError(true);
      setExpense(null);
    } else {
      setExpense(expenseRes.data as ExpenseWithVendor | null);
    }
    setHistory((historyRes.data ?? []) as ExpenseStatusHistory[]);
    setLoading(false);
  }, [supabase, expenseId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!expense) return;
    const { error: deleteError } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (deleteError) {
      console.error("매입 삭제 실패:", deleteError.message);
      toast.error("매입 삭제에 실패했습니다.");
      return;
    }
    sendLog("DELETE_EXPENSE", `매입 삭제: ${expense.title}`, {
      resource: "expense",
      resource_id: expenseId,
    });
    toast.success("매입이 삭제되었습니다.");
    if (expense.project_id) {
      router.push(`/dashboard/projects/${expense.project_id}`);
    } else {
      router.push("/dashboard/expenses");
    }
  };

  const handleStatusAction = useCallback(
    async (
      action: "submit" | "approve" | "reject" | "pay" | "cancel",
      body?: Record<string, unknown>
    ) => {
      try {
        const response = await fetch(`/api/expenses/${expenseId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : "{}",
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) {
          const message = json?.error || `요청에 실패했습니다. (${response.status})`;
          toast.error(message);
          return false;
        }
        await fetchData();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "요청에 실패했습니다.");
        return false;
      }
    },
    [expenseId, fetchData]
  );

  if (loading) {
    return <LoadingState title="매입 정보를 불러오는 중입니다." />;
  }

  if (error || !expense) {
    return (
      <ErrorState
        description="매입 정보를 찾을 수 없습니다."
        action={
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/expenses")}>
            목록으로 돌아가기
          </Button>
        }
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "매입관리", href: "/dashboard/expenses" },
          { label: mask("title", expense.title) },
        ]}
        title={mask("title", expense.title)}
        description={
          expense.vendor_name ? `공급자: ${mask("customer_name", expense.vendor_name)}` : undefined
        }
      />
      <ExpenseDetailContent
        expense={expense}
        history={history}
        variant="page"
        onEdit={() => router.push(`/dashboard/expenses/${expenseId}/edit`)}
        onDelete={handleDelete}
        onStatusAction={handleStatusAction}
      />
    </PageShell>
  );
}

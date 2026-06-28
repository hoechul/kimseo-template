"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ExpenseDetailContent,
  type ExpenseWithVendor,
} from "@/components/expenses/expense-detail-content";
import { ExpenseModalShell } from "@/components/expenses/expense-modal-shell";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseStatusHistory } from "@/lib/types";

export default function ExpenseDetailModalPage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [expense, setExpense] = useState<ExpenseWithVendor | null>(null);
  const [history, setHistory] = useState<ExpenseStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
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
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) {
      console.error("매입 삭제 실패:", error.message);
      toast.error("매입 삭제에 실패했습니다.");
      return;
    }
    sendLog("DELETE_EXPENSE", `매입 삭제: ${expense.title}`, {
      resource: "expense",
      resource_id: expenseId,
    });
    toast.success("매입이 삭제되었습니다.");
    router.back();
    router.refresh();
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

  return (
    <ExpenseModalShell title={expense ? expense.title : "매입 상세"}>
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : !expense ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          매입 정보를 찾을 수 없습니다.
        </div>
      ) : (
        <ExpenseDetailContent
          expense={expense}
          history={history}
          variant="modal"
          onEdit={() => router.push(`/dashboard/expenses/${expenseId}/edit`)}
          onDelete={handleDelete}
          onStatusAction={handleStatusAction}
        />
      )}
    </ExpenseModalShell>
  );
}

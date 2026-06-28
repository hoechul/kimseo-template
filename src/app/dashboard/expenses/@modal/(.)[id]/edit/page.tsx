"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { ExpenseFormBody, type VendorOption } from "@/components/expenses/expense-form-body";
import { ExpenseModalShell } from "@/components/expenses/expense-modal-shell";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseInsert, ExpenseType, Project } from "@/lib/types";

export default function EditExpenseModalPage() {
  const params = useParams();
  const router = useRouter();
  const expenseId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [expense, setExpense] = useState<Expense | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await supabase.auth.getSession();
    const [expenseRes, projectsRes, typesRes, vendorsRes] = await Promise.all([
      supabase.from("expenses").select("*").eq("id", expenseId).single(),
      supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("expense_types").select("*").order("sort_order"),
      supabase
        .from("customers")
        .select(
          "id, name, customer_type, tax_category, default_withholding_rate, bank_name, account_number, account_holder, contact_phone, is_vendor"
        )
        .order("is_vendor", { ascending: false })
        .order("name"),
    ]);
    if (expenseRes.error) {
      console.error("매입 정보 조회 실패:", expenseRes.error.message);
      toast.error("매입 정보를 불러오지 못했습니다.");
      setExpense(null);
    } else {
      setExpense(expenseRes.data as Expense);
    }
    setProjects((projectsRes.data ?? []) as Project[]);
    setExpenseTypes((typesRes.data ?? []) as ExpenseType[]);
    setVendors((vendorsRes.data ?? []) as VendorOption[]);
    setLoading(false);
  }, [supabase, expenseId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async (data: ExpenseInsert) => {
    const nextStatus = data.payment_date
      ? "paid"
      : expense?.status === "paid"
        ? "draft"
        : expense?.status;
    const { error } = await supabase
      .from("expenses")
      .update({ ...data, ...(nextStatus ? { status: nextStatus } : {}) })
      .eq("id", expenseId);
    if (error) {
      console.error("매입 수정 실패:", error.message);
      toast.error("매입 수정에 실패했습니다.");
      return;
    }
    sendLog("UPDATE_EXPENSE", `매입 수정: ${data.title}`, {
      resource: "expense",
      resource_id: expenseId,
    });
    toast.success("매입이 수정되었습니다.");
    router.back();
    router.refresh();
  };

  return (
    <ExpenseModalShell title="매입 수정">
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : !expense ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          매입 항목을 찾을 수 없습니다.
        </div>
      ) : (
        <ExpenseFormBody
          expense={expense}
          projectId={expense.project_id}
          projects={projects}
          expenseTypes={expenseTypes}
          vendors={vendors}
          allowProjectSelection
          onSave={handleSave}
          onCancel={() => router.back()}
          onVendorsChange={setVendors}
        />
      )}
    </ExpenseModalShell>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ExpenseFormBody, type VendorOption } from "@/components/expenses/expense-form-body";
import { ExpenseModalShell } from "@/components/expenses/expense-modal-shell";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseInsert, ExpenseType, Project } from "@/lib/types";

function NewExpenseModalContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");

  const [projects, setProjects] = useState<Project[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [projRes, typesRes, vendorsRes] = await Promise.all([
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
      if (cancelled) return;
      setProjects((projRes.data ?? []) as Project[]);
      setExpenseTypes((typesRes.data ?? []) as ExpenseType[]);
      setVendors((vendorsRes.data ?? []) as VendorOption[]);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSave = async (data: ExpenseInsert) => {
    const { data: inserted, error } = await supabase
      .from("expenses")
      .insert({ ...data, status: data.payment_date ? "paid" : "draft" })
      .select("id")
      .single();
    if (error) {
      console.error("매입 등록 실패:", error.message);
      toast.error("매입 등록에 실패했습니다.");
      return;
    }
    sendLog("CREATE_EXPENSE", `매입 등록: ${data.title}`, {
      resource: "expense",
      resource_id: inserted.id,
    });
    toast.success("매입이 등록되었습니다.");
    router.back();
    router.refresh();
  };

  const handleSaveAndContinue = async (data: ExpenseInsert) => {
    const { data: inserted, error } = await supabase
      .from("expenses")
      .insert({ ...data, status: data.payment_date ? "paid" : "draft" })
      .select("id")
      .single();
    if (error) {
      console.error("매입 등록 실패:", error.message);
      toast.error("매입 등록에 실패했습니다.");
      throw error;
    }
    sendLog("CREATE_EXPENSE", `매입 등록: ${data.title}`, {
      resource: "expense",
      resource_id: inserted.id,
    });
    toast.success("매입이 등록되었습니다.");
    router.refresh();
  };

  return (
    <ExpenseModalShell
      title="매입 등록"
      description="강사비, 외주비, 운영비 등 매입을 기록합니다."
    >
      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : (
        <ExpenseFormBody
          expense={null}
          projectId={projectId}
          projects={projects}
          expenseTypes={expenseTypes}
          vendors={vendors}
          allowProjectSelection
          onSave={handleSave}
          onSaveAndContinue={handleSaveAndContinue}
          onCancel={() => router.back()}
          onVendorsChange={setVendors}
        />
      )}
    </ExpenseModalShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NewExpenseModalContent />
    </Suspense>
  );
}

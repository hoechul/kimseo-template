"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { LoadingState, PageHeader, PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExpenseFormBody,
  type VendorOption,
} from "@/components/expenses/expense-form-body";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseInsert, ExpenseType, Project } from "@/lib/types";

function NewExpenseContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const returnToParam = searchParams.get("returnTo");
  const returnTo = returnToParam && returnToParam.startsWith("/dashboard/") ? returnToParam : null;

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
      if (projRes.error) {
        console.error("프로젝트 목록 조회 실패:", projRes.error.message);
        setProjects([]);
      } else {
        setProjects(projRes.data ?? []);
      }
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
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.push(`/dashboard/expenses/${inserted.id}`);
  };

  if (loading) {
    return (
      <LoadingState
        title="매입 입력 화면을 준비하는 중입니다."
        description="연결 가능한 프로젝트를 불러오고 있습니다."
      />
    );
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[
          { label: "매입관리", href: "/dashboard/expenses" },
          { label: "신규 등록" },
        ]}
        title="매입 등록"
        titleAccessory={projectId ? <Badge variant="secondary">프로젝트 연결 예정</Badge> : null}
        description="강사비, 외주비 등 프로젝트에 따른 매입을 기록합니다."
        actions={
          <Button variant="outline" asChild>
            <Link href={returnTo || "/dashboard/expenses"}>
              <ArrowLeft className="h-4 w-4" />
              목록으로
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-3xl">
        <ExpenseFormBody
          expense={null}
          projectId={projectId}
          projects={projects}
          expenseTypes={expenseTypes}
          vendors={vendors}
          allowProjectSelection
          onSave={handleSave}
          onCancel={() => router.push(returnTo || "/dashboard/expenses")}
          onVendorsChange={setVendors}
        />
      </div>
    </PageShell>
  );
}

export default function NewExpensePage() {
  return (
    <Suspense
      fallback={
        <LoadingState
          title="매입 입력 화면을 준비하는 중입니다."
          description="필수 데이터를 불러오고 있습니다."
        />
      }
    >
      <NewExpenseContent />
    </Suspense>
  );
}

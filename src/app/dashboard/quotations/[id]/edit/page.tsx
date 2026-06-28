"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { QuotationForm } from "@/components/quotation-form";
import { LoadingState } from "@/components/page-shell";
import type { Customer, Project, Quotation, QuotationInsert, QuotationItemInsert } from "@/lib/types";

export default function EditQuotationPage() {
  const params = useParams();
  const router = useRouter();
  const quotationId = params.id as string;
  const supabase = useMemo(() => createClient(), []);

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    await supabase.auth.getSession();

    const [quotationRes, customersRes, projectsRes] = await Promise.all([
      supabase
        .from("quotations")
        .select("*, customers(id, name), projects(id, project_number, name), quotation_items(*)")
        .eq("id", quotationId)
        .single(),
      supabase.from("customers").select("*").order("name").limit(500),
      supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

    if (quotationRes.error) {
      console.error("견적 정보 조회 실패:", quotationRes.error.message);
      toast.error("견적 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    setQuotation(quotationRes.data);
    setCustomers(customersRes.data ?? []);
    setProjects(projectsRes.data ?? []);
    setLoading(false);
  }, [supabase, quotationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (data: QuotationInsert, items: QuotationItemInsert[]) => {
    const cleaned = {
      quotation_date: data.quotation_date,
      valid_until: data.valid_until || null,
      status: data.status,
      customer_id: data.customer_id || null,
      recipient_name: data.recipient_name,
      recipient_contact_name: data.recipient_contact_name || null,
      recipient_phone: data.recipient_phone || null,
      recipient_address: data.recipient_address || null,
      supplier_name: data.supplier_name,
      supplier_representative: data.supplier_representative,
      supplier_business_number: data.supplier_business_number,
      supplier_phone: data.supplier_phone,
      supplier_manager: data.supplier_manager,
      supplier_address: data.supplier_address || null,
      supplier_business_type: data.supplier_business_type || null,
      supplier_business_category: data.supplier_business_category || null,
      supply_total: data.supply_total,
      vat_total: data.vat_total,
      grand_total: data.grand_total,
      payment_terms: data.payment_terms || null,
      delivery_terms: data.delivery_terms || null,
      bank_account: data.bank_account,
      memo: data.memo || null,
      project_id: data.project_id || null,
    };

    const { error } = await supabase
      .from("quotations")
      .update(cleaned)
      .eq("id", quotationId);
    if (error) {
      console.error("견적 수정 실패:", error.message);
      toast.error("견적 수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    // Replace items: delete all, then insert
    await supabase.from("quotation_items").delete().eq("quotation_id", quotationId);
    if (items.length > 0) {
      const itemsPayload = items.map((item, idx) => ({
        quotation_id: quotationId,
        sort_order: idx,
        item_name: item.item_name,
        specification: item.specification || null,
        unit: item.unit || "일",
        quantity: item.quantity,
        unit_price: item.unit_price,
        supply_amount: item.supply_amount,
        remark: item.remark || null,
      }));
      const { error: itemsError } = await supabase.from("quotation_items").insert(itemsPayload);
      if (itemsError) { console.error("품목 수정 실패:", itemsError.message); toast.error("품목 수정에 실패했습니다. 잠시 후 다시 시도해주세요."); }
    }

    toast.success("견적이 수정되었습니다.");
    router.push(`/dashboard/quotations/${quotationId}`);
  };

  if (loading) {
    return <LoadingState title="견적 정보를 불러오는 중입니다." />;
  }

  if (!quotation) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">견적을 찾을 수 없습니다.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/quotations")}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <QuotationForm
      quotation={quotation}
      customers={customers}
      projects={projects}
      onSave={handleSave}
    />
  );
}

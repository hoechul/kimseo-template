"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendLog } from "@/lib/log-client";
import { QuotationForm } from "@/components/quotation-form";
import type { Customer, Project, Quotation, QuotationInsert, QuotationItemInsert } from "@/lib/types";

export default function NewQuotationPage() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><p className="text-sm text-muted-foreground">불러오는 중...</p></div>}>
      <NewQuotationContent />
    </Suspense>
  );
}

function NewQuotationContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get("from");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sourceQuotation, setSourceQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [customersRes, projectsRes] = await Promise.all([
      supabase.from("customers").select("*").order("name").limit(500),
      supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    setCustomers(customersRes.data ?? []);
    setProjects(projectsRes.data ?? []);

    if (fromId) {
      const { data } = await supabase
        .from("quotations")
        .select("*, quotation_items(*)")
        .eq("id", fromId)
        .single();
      setSourceQuotation(data);
    }

    setLoading(false);
  }, [supabase, fromId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (data: QuotationInsert, items: QuotationItemInsert[]) => {
    const { data: numberData, error: numberError } = await supabase.rpc("generate_quotation_number");
    if (numberError || !numberData) {
      console.error("견적번호 생성 실패:", numberError?.message ?? "Unknown error");
      toast.error("견적번호 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    // 버전 관리: 기존 견적에서 새 버전 생성 시
    const parentId = sourceQuotation?.parent_id ?? sourceQuotation?.id ?? null;
    const newVersion = sourceQuotation ? sourceQuotation.version + 1 : 1;
    // 버전이 있으면 원본 번호에 -N 붙이기
    const baseNumber = sourceQuotation
      ? sourceQuotation.quotation_number.replace(/-\d+$/, "")
      : (numberData as string);
    const displayNumber = newVersion > 1 ? `${baseNumber}-${newVersion}` : baseNumber;

    const cleaned = {
      quotation_number: displayNumber,
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
      version: newVersion,
      parent_id: parentId,
    };

    const { data: inserted, error } = await supabase
      .from("quotations")
      .insert(cleaned)
      .select("id")
      .single();
    if (error) {
      console.error("견적 등록 실패:", error.message);
      toast.error("견적 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (items.length > 0) {
      const itemsPayload = items.map((item, idx) => ({
        quotation_id: inserted.id,
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
      if (itemsError) {
        console.error("품목 등록 실패:", itemsError.message);
        toast.error("품목 등록에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    }

    sendLog("CREATE_QUOTATION", `견적 등록: ${cleaned.quotation_number}`, {
      resource: "quotation",
      resource_id: inserted.id,
    });
    toast.success("견적이 등록되었습니다.");
    router.push(`/dashboard/quotations/${inserted.id}`);
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  return (
    <QuotationForm
      quotation={sourceQuotation}
      customers={customers}
      projects={projects}
      onSave={handleSave}
      isNewVersion={!!sourceQuotation}
    />
  );
}

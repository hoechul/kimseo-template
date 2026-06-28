"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SUPPLIER, DEFAULT_BANK_ACCOUNT, QUOTATION_STATUSES } from "@/lib/quotation-constants";
import { addDaysToDateString, toKstDateString } from "@/lib/date";
import type { Customer, Project, Quotation, QuotationInsert, QuotationItemInsert } from "@/lib/types";

export interface AiGeneratedQuotation {
  recipient_name?: string;
  recipient_contact_name?: string | null;
  items?: {
    item_name: string;
    specification?: string | null;
    unit?: string;
    quantity?: number;
    unit_price?: number;
    remark?: string | null;
  }[];
  payment_terms?: string | null;
  delivery_terms?: string | null;
  memo?: string | null;
}

interface QuotationFormProps {
  quotation: Quotation | null;
  customers: Customer[];
  projects: Project[];
  onSave: (data: QuotationInsert, items: QuotationItemInsert[]) => Promise<void>;
  isNewVersion?: boolean;
  aiData?: AiGeneratedQuotation | null;
}

function createEmptyItem(sortOrder: number, quotationId = ""): QuotationItemInsert {
  return {
    quotation_id: quotationId,
    sort_order: sortOrder,
    item_name: "",
    specification: "",
    unit: "일",
    quantity: 1,
    unit_price: 0,
    supply_amount: 0,
    remark: "",
  };
}

function createEmptyForm(): QuotationInsert {
  const today = toKstDateString();
  return {
    quotation_date: today,
    valid_until: addDaysToDateString(today, 30),
    status: "작성중",
    customer_id: null,
    recipient_name: "",
    recipient_contact_name: "",
    recipient_phone: "",
    recipient_address: "",
    ...DEFAULT_SUPPLIER,
    supply_total: 0,
    vat_total: 0,
    grand_total: 0,
    payment_terms: "",
    delivery_terms: "",
    bank_account: DEFAULT_BANK_ACCOUNT,
    memo: "",
    project_id: null,
    parent_id: null,
  };
}

export function QuotationForm({
  quotation,
  customers,
  projects,
  onSave,
  isNewVersion,
  aiData,
}: QuotationFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<QuotationInsert>(createEmptyForm());
  const [items, setItems] = useState<QuotationItemInsert[]>([createEmptyItem(0)]);
  const [loading, setLoading] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);

  useEffect(() => {
    if (quotation) {
      setForm({
        quotation_date: quotation.quotation_date,
        valid_until: quotation.valid_until,
        status: quotation.status,
        customer_id: quotation.customer_id,
        recipient_name: quotation.recipient_name,
        recipient_contact_name: quotation.recipient_contact_name ?? "",
        recipient_phone: quotation.recipient_phone ?? "",
        recipient_address: quotation.recipient_address ?? "",
        supplier_name: quotation.supplier_name,
        supplier_representative: quotation.supplier_representative,
        supplier_business_number: quotation.supplier_business_number,
        supplier_phone: quotation.supplier_phone,
        supplier_manager: quotation.supplier_manager,
        supplier_address: quotation.supplier_address ?? "",
        supplier_business_type: quotation.supplier_business_type ?? "",
        supplier_business_category: quotation.supplier_business_category ?? "",
        supply_total: quotation.supply_total,
        vat_total: quotation.vat_total,
        grand_total: quotation.grand_total,
        payment_terms: quotation.payment_terms ?? "",
        delivery_terms: quotation.delivery_terms ?? "",
        bank_account: quotation.bank_account,
        memo: quotation.memo ?? "",
        project_id: quotation.project_id,
        parent_id: quotation.parent_id ?? null,
      });
      if (quotation.quotation_items && quotation.quotation_items.length > 0) {
        setItems(
          quotation.quotation_items
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((item) => ({
              quotation_id: item.quotation_id,
              sort_order: item.sort_order,
              item_name: item.item_name,
              specification: item.specification ?? "",
              unit: item.unit,
              quantity: item.quantity,
              unit_price: item.unit_price,
              supply_amount: item.supply_amount,
              remark: item.remark ?? "",
            }))
        );
      } else {
        setItems([createEmptyItem(0)]);
      }
    } else {
      setForm(createEmptyForm());
      setItems([createEmptyItem(0)]);
    }
    setShowSupplier(false);
  }, [quotation]);

  // Apply AI-generated data
  useEffect(() => {
    if (!aiData) return;
    setForm((prev) => ({
      ...prev,
      recipient_name: aiData.recipient_name || prev.recipient_name,
      recipient_contact_name: aiData.recipient_contact_name ?? prev.recipient_contact_name,
      payment_terms: aiData.payment_terms ?? prev.payment_terms,
      delivery_terms: aiData.delivery_terms ?? prev.delivery_terms,
      memo: aiData.memo ?? prev.memo,
    }));
    if (aiData.items && aiData.items.length > 0) {
      setItems(
        aiData.items.map((item, idx) => ({
          quotation_id: "",
          sort_order: idx,
          item_name: item.item_name || "",
          specification: item.specification ?? "",
          unit: item.unit || "일",
          quantity: item.quantity ?? 1,
          unit_price: item.unit_price ?? 0,
          supply_amount: (item.quantity ?? 1) * (item.unit_price ?? 0),
          remark: item.remark ?? "",
        }))
      );
    }
  }, [aiData]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.project_number.localeCompare(b.project_number)),
    [projects]
  );

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers]
  );

  // Recalculate totals when items change
  useEffect(() => {
    const supplyTotal = items.reduce((sum, item) => sum + item.supply_amount, 0);
    const vatTotal = Math.round(supplyTotal * 0.1);
    setForm((prev) => ({
      ...prev,
      supply_total: supplyTotal,
      vat_total: vatTotal,
      grand_total: supplyTotal + vatTotal,
    }));
  }, [items]);

  const updateItem = (index: number, field: keyof QuotationItemInsert, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        item.supply_amount = (item.quantity || 0) * (item.unit_price || 0);
      }
      updated[index] = item;
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, createEmptyItem(prev.length)]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((item, i) => ({ ...item, sort_order: i }))
    );
  };

  const handleCustomerChange = (customerId: string) => {
    if (customerId) {
      const customer = sortedCustomers.find((c) => c.id === customerId);
      setForm((prev) => ({
        ...prev,
        customer_id: customerId,
        recipient_name: customer?.name ?? prev.recipient_name,
        recipient_address: customer?.address ?? prev.recipient_address,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        customer_id: null,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(form, items);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  const isEdit = quotation && !isNewVersion;
  const backUrl = isEdit
    ? `/dashboard/quotations/${quotation.id}`
    : "/dashboard/quotations";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/dashboard/quotations"
            className="text-muted-foreground hover:text-foreground"
          >
            견적관리
          </Link>
          <span className="text-muted-foreground">/</span>
          {isEdit ? (
            <>
              <Link
                href={`/dashboard/quotations/${quotation.id}`}
                className="text-muted-foreground hover:text-foreground"
              >
                {quotation.quotation_number}
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">수정</span>
            </>
          ) : isNewVersion && quotation ? (
            <>
              <Link
                href={`/dashboard/quotations/${quotation.id}`}
                className="text-muted-foreground hover:text-foreground"
              >
                {quotation.quotation_number}
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">새 버전</span>
            </>
          ) : (
            <span className="font-medium">새 견적</span>
          )}
        </div>
        <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {isNewVersion ? "새 버전 작성" : isEdit ? "견적 수정" : "견적 등록"}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기본정보 */}
        <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">기본정보</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="q-date">견적일 *</Label>
              <Input
                id="q-date"
                type="date"
                value={form.quotation_date}
                onChange={(e) => {
                  const date = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    quotation_date: date,
                    valid_until: date ? addDaysToDateString(date, 30) : prev.valid_until,
                  }));
                }}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-valid">유효기간</Label>
              <Input
                id="q-valid"
                type="date"
                value={form.valid_until ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valid_until: e.target.value || null }))
                }
              />
            </div>
            {isEdit && (
              <div className="space-y-1">
                <Label htmlFor="q-status">상태</Label>
                <select
                  id="q-status"
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, status: e.target.value as typeof prev.status }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {QUOTATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="q-project">프로젝트</Label>
              <select
                id="q-project"
                value={form.project_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, project_id: e.target.value || null }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">프로젝트 미지정</option>
                {sortedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} · {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 수신자 */}
        <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">수신자 정보</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="q-customer">고객 선택 (선택사항)</Label>
              <select
                id="q-customer"
                value={form.customer_id ?? ""}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">직접 입력</option>
                {sortedCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-recipient">수신자명 *</Label>
              <Input
                id="q-recipient"
                value={form.recipient_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, recipient_name: e.target.value }))
                }
                placeholder="수신자 (회사/개인명)"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-rcontact">담당자</Label>
              <Input
                id="q-rcontact"
                value={form.recipient_contact_name ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, recipient_contact_name: e.target.value }))
                }
                placeholder="담당자명"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-rphone">연락처</Label>
              <Input
                id="q-rphone"
                value={form.recipient_phone ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, recipient_phone: e.target.value }))
                }
                placeholder="전화번호"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-raddr">주소</Label>
              <Input
                id="q-raddr"
                value={form.recipient_address ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, recipient_address: e.target.value }))
                }
                placeholder="주소"
              />
            </div>
          </div>
        </div>

        {/* 공급자 (접기/펼치기) */}
        <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-4">
          <button
            type="button"
            onClick={() => setShowSupplier(!showSupplier)}
            className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showSupplier ? "rotate-90" : ""}`}
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
            공급자 정보 {showSupplier ? "(접기)" : "(펼치기)"}
          </button>
          {showSupplier && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>상호</Label>
                <Input
                  value={form.supplier_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>대표자</Label>
                <Input
                  value={form.supplier_representative}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_representative: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>사업자번호</Label>
                <Input
                  value={form.supplier_business_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_business_number: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>연락처</Label>
                <Input
                  value={form.supplier_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>담당자</Label>
                <Input
                  value={form.supplier_manager}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_manager: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>주소</Label>
                <Input
                  value={form.supplier_address ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_address: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>업태</Label>
                <Input
                  value={form.supplier_business_type ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_business_type: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>종목</Label>
                <Input
                  value={form.supplier_business_category ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, supplier_business_category: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        {/* 품목 - 테이블 형식 */}
        <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground">품목</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                단가는 한국소프트웨어산업협회 「2026 소프트웨어기술자 노임단가」를 참고하였습니다.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              + 행 추가
            </Button>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-2 text-center w-10">No</th>
                  <th className="px-2 py-2 text-left">품명 *</th>
                  <th className="px-2 py-2 text-center w-16">단위</th>
                  <th className="px-2 py-2 text-right w-20">수량</th>
                  <th className="px-2 py-2 text-right w-32">단가</th>
                  <th className="px-2 py-2 text-right w-32">금액</th>
                  <th className="px-2 py-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-2 py-1.5 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="px-1 py-1.5">
                      <Input
                        value={item.item_name}
                        onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                        placeholder="품명"
                        required
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <Input
                        value={item.unit}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        className="h-8 text-sm text-center w-14"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                        className="h-8 text-sm text-right w-18"
                      />
                    </td>
                    <td className="px-1 py-1.5">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={item.unit_price ? item.unit_price.toLocaleString() : ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          updateItem(idx, "unit_price", parseInt(raw) || 0);
                        }}
                        placeholder="0"
                        className="h-8 text-sm text-right"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-sm tabular-nums">
                      {fmt(item.supply_amount)}
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-destructive hover:text-destructive/80 p-1"
                          title="삭제"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: compact rows */}
          <div className="space-y-3 sm:hidden">
            {items.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-xs text-destructive hover:underline"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <Input
                  value={item.item_name}
                  onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                  placeholder="품명 *"
                  required
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">단위</Label>
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">수량</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">단가</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={item.unit_price ? item.unit_price.toLocaleString() : ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        updateItem(idx, "unit_price", parseInt(raw) || 0);
                      }}
                      placeholder="0"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">금액</span>
                  <span className="font-medium tabular-nums">{fmt(item.supply_amount)}원</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 합계 */}
        <div className="rounded-lg border bg-muted/30 p-4 sm:p-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">공급가액</span>
            <span className="font-medium tabular-nums">{fmt(form.supply_total)}원</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">부가세 (10%)</span>
            <span className="font-medium tabular-nums">{fmt(form.vat_total)}원</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="font-semibold">합계</span>
            <span className="text-lg font-bold tabular-nums">{fmt(form.grand_total)}원</span>
          </div>
        </div>

        {/* 조건/메모 */}
        <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">조건 및 메모</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="q-payment">결제조건</Label>
              <Input
                id="q-payment"
                value={form.payment_terms ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, payment_terms: e.target.value }))
                }
                placeholder="예: 계약금 50%, 잔금 50%"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="q-delivery">납기</Label>
              <Input
                id="q-delivery"
                value={form.delivery_terms ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, delivery_terms: e.target.value }))
                }
                placeholder="예: 계약 후 2주"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="q-bank">입금계좌</Label>
              <Input
                id="q-bank"
                value={form.bank_account}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, bank_account: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="q-memo">비고 / 특약사항</Label>
              <textarea
                id="q-memo"
                value={form.memo ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, memo: e.target.value }))
                }
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="메모"
              />
            </div>
          </div>
        </div>

        {/* 단가 참고 안내 */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">단가 산출 근거</p>
          <p>
            본 견적서의 인건비 단가는 한국소프트웨어산업협회가 공시한{" "}
            <span className="font-semibold">「2026년 소프트웨어기술자 노임단가」</span>를 기준으로 산정되었습니다.
          </p>
        </div>

        {/* 버튼 */}
        <div className="flex flex-col-reverse gap-2 pb-6 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backUrl)}
          >
            취소
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "저장 중..." : isNewVersion ? "새 버전 등록" : isEdit ? "수정" : "등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}

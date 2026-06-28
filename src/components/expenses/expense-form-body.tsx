"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calcWithholding, PERSONAL_WITHHOLDING_RATE } from "@/lib/expenses/tax";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type {
  CustomerType,
  Expense,
  ExpenseInsert,
  Project,
  VendorTaxCategory,
} from "@/lib/types";

export interface ExpenseTypeOption {
  id: string;
  name: string;
  is_vat_deductible?: boolean;
}

export interface VendorOption {
  id: string;
  name: string;
  customer_type: CustomerType | null;
  tax_category: VendorTaxCategory | null;
  default_withholding_rate: number | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  contact_phone: string | null;
  is_vendor: boolean;
}

interface ExpenseFormBodyProps {
  expense: Expense | null;
  projectId?: string | null;
  projects?: Project[];
  expenseTypes?: ExpenseTypeOption[];
  vendors?: VendorOption[];
  allowProjectSelection?: boolean;
  onSave: (data: ExpenseInsert) => Promise<void>;
  onCancel: () => void;
  onVendorsChange?: (vendors: VendorOption[]) => void;
  /** 제출 후 다시 빈 폼으로 초기화 후 저장 콜백을 호출. 등록 모드 + 콜백 있을 때만 노출 */
  onSaveAndContinue?: (data: ExpenseInsert) => Promise<void>;
}

const TAX_CATEGORY_OPTIONS: Array<{
  value: VendorTaxCategory;
  label: string;
  hint: string;
}> = [
  {
    value: "personal_withholding",
    label: "개인 (원천 3.3%)",
    hint: "개인에게 지급. 세금계산서 없이 원천세 3.3% 차감 후 지급",
  },
  {
    value: "business_vat",
    label: "사업자 (세금계산서)",
    hint: "개인사업자에게 지급. 세금계산서 수취 필요 (부가세 10%)",
  },
  {
    value: "corporate_vat",
    label: "법인 (세금계산서)",
    hint: "법인에게 지급. 세금계산서 수취 필요 (부가세 10%)",
  },
  { value: "none", label: "해당없음", hint: "위 세 경우에 해당하지 않을 때" },
];

type InvoiceState = "not_required" | "not_received" | "received";

function createEmptyExpense(projectId: string | null = null): ExpenseInsert {
  return {
    project_id: projectId,
    type_id: null,
    title: "",
    vendor_name: null,
    vendor_id: null,
    total_amount: 0,
    supply_amount: 0,
    vat_amount: 0,
    vat_included: true,
    purchase_date: "",
    payment_date: "",
    purchase_tax_invoice_received: false,
    purchase_tax_invoice_date: "",
    purchase_tax_invoice_not_required: false,
    tax_category: null,
    withholding_rate: null,
    withholding_amount: 0,
    memo: "",
  };
}

function deriveInvoiceState(form: ExpenseInsert): InvoiceState {
  if (form.purchase_tax_invoice_not_required) return "not_required";
  if (form.purchase_tax_invoice_received) return "received";
  return "not_received";
}

function expenseToForm(expense: Expense): ExpenseInsert {
  return {
    project_id: expense.project_id,
    type_id: expense.type_id ?? null,
    title: expense.title,
    vendor_name: expense.vendor_name ?? null,
    vendor_id: expense.vendor_id ?? null,
    total_amount: expense.total_amount,
    supply_amount: expense.supply_amount,
    vat_amount: expense.vat_amount,
    vat_included: expense.vat_included ?? true,
    purchase_date: expense.purchase_date ?? "",
    payment_date: expense.payment_date ?? "",
    purchase_tax_invoice_received: expense.purchase_tax_invoice_received,
    purchase_tax_invoice_date: expense.purchase_tax_invoice_date ?? "",
    purchase_tax_invoice_not_required: expense.purchase_tax_invoice_not_required ?? false,
    tax_category: expense.tax_category ?? null,
    withholding_rate: expense.withholding_rate ?? null,
    withholding_amount: expense.withholding_amount ?? 0,
    memo: expense.memo ?? "",
  };
}

export function ExpenseFormBody({
  expense,
  projectId = null,
  projects = [],
  expenseTypes = [],
  vendors = [],
  allowProjectSelection = false,
  onSave,
  onCancel,
  onVendorsChange,
  onSaveAndContinue,
}: ExpenseFormBodyProps) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<ExpenseInsert>(createEmptyExpense(projectId));
  const [loading, setLoading] = useState(false);
  const [savingContinue, setSavingContinue] = useState(false);
  const [displayAmount, setDisplayAmount] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
  const [vendorPopoverOpen, setVendorPopoverOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [showAlternateName, setShowAlternateName] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.project_number.localeCompare(b.project_number)),
    [projects]
  );

  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.id === form.project_id) ?? null,
    [sortedProjects, form.project_id]
  );

  const selectedProjectLabel = useMemo(() => {
    if (!selectedProject) return null;
    return `[${selectedProject.project_number}] ${selectedProject.name}${
      selectedProject.client ? ` - ${selectedProject.client}` : ""
    }`;
  }, [selectedProject]);

  const sortedVendors = useMemo(() => {
    return [...vendors].sort((a, b) => {
      if (a.is_vendor !== b.is_vendor) return a.is_vendor ? -1 : 1;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [vendors]);

  const selectedVendor = useMemo(
    () => sortedVendors.find((vendor) => vendor.id === form.vendor_id) ?? null,
    [sortedVendors, form.vendor_id]
  );

  const matchedVendors = useMemo(() => {
    const keyword = vendorSearch.trim().toLowerCase();
    if (!keyword) return sortedVendors;
    return sortedVendors.filter((vendor) => {
      if (vendor.name.toLowerCase().includes(keyword)) return true;
      if (vendor.contact_phone?.toLowerCase().includes(keyword)) return true;
      if (vendor.account_holder?.toLowerCase().includes(keyword)) return true;
      return false;
    });
  }, [sortedVendors, vendorSearch]);

  const exactVendorMatch = useMemo(() => {
    const keyword = vendorSearch.trim().toLowerCase();
    if (!keyword) return true;
    return sortedVendors.some((vendor) => vendor.name.toLowerCase() === keyword);
  }, [sortedVendors, vendorSearch]);

  useEffect(() => {
    if (expense) {
      setForm(expenseToForm(expense));
      const initial = (expense.vat_included ?? true) ? expense.total_amount : expense.supply_amount;
      setDisplayAmount(initial ? initial.toLocaleString() : "");
      // 수정 진입 시 별도 표시명이 있으면 토글 자동 펼침
      if (expense.vendor_name && expense.vendor_id) {
        const linked = vendors.find((v) => v.id === expense.vendor_id);
        if (linked && expense.vendor_name.trim() !== linked.name.trim()) {
          setShowAlternateName(true);
        }
      }
      // 고급 옵션 자동 펼침 조건: 매입 구분/세금계산서 상태/프로젝트 연결/비고 중 하나라도 채워졌으면
      if (
        expense.tax_category ||
        expense.purchase_tax_invoice_not_required ||
        expense.purchase_tax_invoice_received ||
        expense.project_id ||
        expense.memo
      ) {
        setAdvancedOpen(true);
      }
    } else {
      setForm(createEmptyExpense(projectId));
      setDisplayAmount("");
    }
    setProjectPopoverOpen(false);
    setVendorPopoverOpen(false);
    setVendorSearch("");
  }, [expense, projectId, vendors]);

  const formatNumberWithCommas = (value: string) => {
    const num = value.replace(/[^\d]/g, "");
    return num ? Number(num).toLocaleString() : "";
  };

  const formatNumber = (value: number) => value.toLocaleString("ko-KR");

  const withholdingPreview = useMemo(() => {
    return calcWithholding({
      totalAmount: form.total_amount,
      taxCategory: form.tax_category,
      withholdingRate: form.withholding_rate,
    });
  }, [form.total_amount, form.tax_category, form.withholding_rate]);

  const handleVendorSelect = (vendorId: string | null) => {
    if (!vendorId) {
      setForm((prev) => ({ ...prev, vendor_id: null, vendor_name: null }));
      setVendorPopoverOpen(false);
      return;
    }
    const vendor = sortedVendors.find((v) => v.id === vendorId);
    if (!vendor) {
      setForm((prev) => ({ ...prev, vendor_id: vendorId }));
      setVendorPopoverOpen(false);
      return;
    }
    setForm((prev) => ({
      ...prev,
      vendor_id: vendor.id,
      vendor_name: prev.vendor_name?.trim() ? prev.vendor_name : vendor.name,
      tax_category: prev.tax_category ?? vendor.tax_category ?? null,
      withholding_rate:
        prev.withholding_rate ??
        (vendor.default_withholding_rate !== null
          ? Number(vendor.default_withholding_rate)
          : vendor.tax_category === "personal_withholding"
            ? PERSONAL_WITHHOLDING_RATE
            : null),
      purchase_tax_invoice_not_required:
        (prev.tax_category ?? vendor.tax_category) === "personal_withholding"
          ? true
          : prev.purchase_tax_invoice_not_required,
    }));
    setVendorPopoverOpen(false);
    setVendorSearch("");
  };

  const handleCreateVendor = async () => {
    const name = vendorSearch.trim();
    if (!name) return;
    setCreatingVendor(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({ name, is_vendor: true })
        .select(
          "id, name, customer_type, tax_category, default_withholding_rate, bank_name, account_number, account_holder, contact_phone, is_vendor"
        )
        .single();
      if (error || !data) {
        console.error("매입처 생성 실패:", error?.message);
        toast.error("매입처를 추가하지 못했습니다.");
        return;
      }
      const newVendor = data as VendorOption;
      onVendorsChange?.([newVendor, ...vendors]);
      toast.success(`'${name}' 매입처가 추가되었습니다.`);
      handleVendorSelect(newVendor.id);
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleTaxCategoryChange = (value: VendorTaxCategory | "") => {
    const category: VendorTaxCategory | null = value === "" ? null : value;
    setForm((prev) => ({
      ...prev,
      tax_category: category,
      withholding_rate:
        category === "personal_withholding"
          ? prev.withholding_rate ?? PERSONAL_WITHHOLDING_RATE
          : null,
      purchase_tax_invoice_not_required:
        category === "personal_withholding" ? true : prev.purchase_tax_invoice_not_required,
    }));
  };

  const handleInvoiceStateChange = (state: InvoiceState) => {
    setForm((prev) => {
      if (state === "not_required") {
        return {
          ...prev,
          purchase_tax_invoice_not_required: true,
          purchase_tax_invoice_received: false,
          purchase_tax_invoice_date: "",
        };
      }
      if (state === "not_received") {
        return {
          ...prev,
          purchase_tax_invoice_not_required: false,
          purchase_tax_invoice_received: false,
          purchase_tax_invoice_date: "",
        };
      }
      return {
        ...prev,
        purchase_tax_invoice_not_required: false,
        purchase_tax_invoice_received: true,
      };
    });
  };

  const recalcAmounts = (amount: number, vatIncluded: boolean) => {
    if (vatIncluded) {
      const supply = Math.round(amount / 1.1);
      const vat = amount - supply;
      return { total_amount: amount, supply_amount: supply, vat_amount: vat };
    }
    return { total_amount: amount, supply_amount: amount, vat_amount: 0 };
  };

  const handleTotalAmountChange = (value: string) => {
    const rawNum = value.replace(/[^\d]/g, "");
    const total = Number.parseInt(rawNum, 10) || 0;
    const amounts = recalcAmounts(total, form.vat_included);
    setForm((prev) => ({ ...prev, ...amounts }));
    setDisplayAmount(formatNumberWithCommas(rawNum));
  };

  const handleVatIncludedChange = (checked: boolean) => {
    const currentInput = checked ? form.total_amount : form.supply_amount;
    const amounts = recalcAmounts(currentInput, checked);
    setForm((prev) => ({ ...prev, vat_included: checked, ...amounts }));
    setDisplayAmount(currentInput ? currentInput.toLocaleString() : "");
  };

  const buildPayload = (): ExpenseInsert => {
    const calc = calcWithholding({
      totalAmount: form.total_amount,
      taxCategory: form.tax_category,
      withholdingRate: form.withholding_rate,
    });
    return {
      ...form,
      project_id: form.project_id || null,
      type_id: form.type_id || null,
      vendor_id: form.vendor_id || null,
      vendor_name: form.vendor_name?.trim() ? form.vendor_name.trim() : null,
      tax_category: form.tax_category,
      withholding_rate: form.withholding_rate,
      withholding_amount: calc.withholdingAmount,
      purchase_date: form.purchase_date || null,
      payment_date: form.payment_date || null,
      purchase_tax_invoice_received: form.purchase_tax_invoice_not_required
        ? false
        : form.purchase_tax_invoice_received,
      purchase_tax_invoice_date:
        !form.purchase_tax_invoice_not_required && form.purchase_tax_invoice_received
          ? form.purchase_tax_invoice_date || null
          : null,
      memo: form.memo || null,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onSave(buildPayload());
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAndContinue = async () => {
    if (!onSaveAndContinue) return;
    setSavingContinue(true);
    try {
      await onSaveAndContinue(buildPayload());
      setForm(createEmptyExpense(projectId));
      setDisplayAmount("");
      setShowAlternateName(false);
    } finally {
      setSavingContinue(false);
    }
  };

  const invoiceState = deriveInvoiceState(form);
  const showInvoiceSection = form.tax_category !== "personal_withholding";

  const InvoiceOption = ({
    state,
    label,
    description,
  }: {
    state: InvoiceState;
    label: string;
    description: string;
  }) => {
    const active = invoiceState === state;
    return (
      <button
        type="button"
        onClick={() => handleInvoiceStateChange(state)}
        className={cn(
          "flex flex-1 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
          active
            ? "border-primary bg-primary/10"
            : "border-input bg-background hover:bg-accent/50"
        )}
        aria-pressed={active}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full border",
              active ? "border-primary bg-primary text-primary-foreground" : "border-input"
            )}
          >
            {active ? <span className="h-2 w-2 rounded-full bg-current" /> : null}
          </span>
          {label}
        </span>
        <span className="text-muted-foreground">{description}</span>
      </button>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-4">
        {/* 매입 항목명 */}
        <div className="space-y-1.5">
          <Label htmlFor="exp-title">매입 항목명</Label>
          <Input
            id="exp-title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="예: 강사료, 외주 디자인, 카페 미팅"
            required
          />
        </div>

        {/* 매입 유형 (있을 때만) */}
        {expenseTypes.length > 0 ? (
          <div className="space-y-1.5">
            <Label>매입 유형</Label>
            <div className="flex flex-wrap gap-1.5">
              {expenseTypes.map((pt) => {
                const selected = form.type_id === pt.id;
                const nonDeductible = pt.is_vat_deductible === false;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        type_id: prev.type_id === pt.id ? null : pt.id,
                      }))
                    }
                    title={nonDeductible ? "부가세 매입세액 공제 불가 항목" : undefined}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : nonDeductible
                          ? "border-destructive/40 bg-background text-destructive hover:bg-destructive/10"
                          : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {pt.name}
                    {nonDeductible && <span className="ml-1 opacity-70">✕</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 매입처 (콤보 통합) */}
        <div className="space-y-1.5">
          <Label htmlFor="exp-vendor-picker">매입처</Label>
          <Popover open={vendorPopoverOpen} onOpenChange={setVendorPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                id="exp-vendor-picker"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={vendorPopoverOpen}
                className="h-10 w-full justify-between rounded-xl border border-input/85 bg-background/80 px-3.5 font-normal shadow-sm"
              >
                <span className={cn("truncate", !selectedVendor && "text-muted-foreground")}>
                  {selectedVendor
                    ? `${selectedVendor.name}${
                        selectedVendor.customer_type ? ` (${selectedVendor.customer_type})` : ""
                      }`
                    : "매입처 검색 또는 새로 추가..."}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="이름, 전화번호, 예금주 검색..."
                  value={vendorSearch}
                  onValueChange={setVendorSearch}
                />
                <CommandList>
                  {matchedVendors.length === 0 && !vendorSearch.trim() ? (
                    <CommandEmpty>등록된 매입처가 없습니다.</CommandEmpty>
                  ) : null}
                  {vendorSearch.trim() && !exactVendorMatch ? (
                    <CommandGroup heading="새로 추가">
                      <CommandItem
                        value="__create__"
                        onSelect={() => {
                          void handleCreateVendor();
                        }}
                        disabled={creatingVendor}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        <span className="truncate">
                          {creatingVendor
                            ? "추가 중..."
                            : `"${vendorSearch.trim()}" 매입처로 새로 등록`}
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  ) : null}
                  {matchedVendors.length > 0 ? (
                    <CommandGroup heading="매입처 목록">
                      {matchedVendors.map((vendor) => (
                        <CommandItem
                          key={vendor.id}
                          value={vendor.id}
                          onSelect={(value) => {
                            const toggled = value === form.vendor_id ? null : value;
                            handleVendorSelect(toggled);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.vendor_id === vendor.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">
                            {vendor.name}
                            {vendor.customer_type ? ` (${vendor.customer_type})` : ""}
                            {vendor.is_vendor ? "" : " · 매입정보 미설정"}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedVendor ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div>
                계좌: {selectedVendor.bank_name ?? "-"} {selectedVendor.account_number ?? "-"}{" "}
                {selectedVendor.account_holder ? `(${selectedVendor.account_holder})` : ""}
              </div>
              <div>연락처: {selectedVendor.contact_phone ?? "-"}</div>
              {!selectedVendor.is_vendor ? (
                <p className="mt-1 text-amber-700">
                  이 고객에는 매입 구분·계좌 정보가 없습니다. 고객 상세에서 등록하면 다음 매입부터
                  자동 채워집니다.
                </p>
              ) : null}
            </div>
          ) : null}
          {!showAlternateName ? (
            <button
              type="button"
              onClick={() => setShowAlternateName(true)}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              세금계산서·통장에 다르게 표시
            </button>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="exp-vendor-name" className="text-xs">
                세금계산서·통장 표시명
              </Label>
              <Input
                id="exp-vendor-name"
                value={form.vendor_name ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, vendor_name: event.target.value }))
                }
                placeholder={selectedVendor?.name ?? "표시명"}
              />
            </div>
          )}
        </div>

        {/* 금액 + 매입일 / 지급일 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="total_amount">
              매입금액 {form.vat_included ? "(부가세 포함)" : "(공급가액)"}
            </Label>
            <Input
              id="total_amount"
              type="text"
              inputMode="numeric"
              value={displayAmount}
              onChange={(event) => handleTotalAmountChange(event.target.value)}
              placeholder="0"
            />
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={form.vat_included}
                onChange={(event) => handleVatIncludedChange(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              부가세 포함 금액
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchase_date">매입일</Label>
            <DateInput
              id="purchase_date"
              value={form.purchase_date ?? ""}
              onChange={(value) => setForm((prev) => ({ ...prev, purchase_date: value }))}
            />
          </div>

          {form.vat_included && form.total_amount > 0 ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">공급가액</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm">
                  {formatNumber(form.supply_amount)}원
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">부가세</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm">
                  {formatNumber(form.vat_amount)}원
                </div>
              </div>
            </>
          ) : null}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="payment_date">지급일</Label>
            <DateInput
              id="payment_date"
              value={form.payment_date ?? ""}
              onChange={(value) => setForm((prev) => ({ ...prev, payment_date: value }))}
              placeholder="비워두면 미지급으로 표시"
            />
            <p className="text-xs text-muted-foreground">
              체크카드처럼 즉시 지급되는 경우 매입일과 동일하게 입력하세요.
            </p>
          </div>
        </div>
      </div>

      {/* 고급 옵션 Collapsible */}
      <div className="rounded-xl border border-border/60 bg-muted/20">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          aria-expanded={advancedOpen}
        >
          <span>고급 옵션 (세금/세금계산서/프로젝트/비고)</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              advancedOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </button>
        {advancedOpen ? (
          <div className="space-y-5 border-t border-border/60 px-4 py-4">
            {/* 매입 구분 */}
            <div className="space-y-1.5">
              <Label>이 매입은 어떻게 처리되나요?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {TAX_CATEGORY_OPTIONS.map((option) => {
                  const active = form.tax_category === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleTaxCategoryChange(option.value)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-input bg-background hover:bg-accent/50"
                      )}
                      aria-pressed={active}
                    >
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    </button>
                  );
                })}
              </div>
              {form.tax_category === "personal_withholding" && form.total_amount > 0 ? (
                <div className="mt-2 rounded-md border border-dashed border-border/70 bg-background px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span>
                      원천징수 ({(withholdingPreview.appliedRate * 100).toFixed(1)}%)
                    </span>
                    <span className="font-medium">
                      {formatNumber(withholdingPreview.withholdingAmount)}원
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm font-medium">
                    <span>실지급액</span>
                    <span>{formatNumber(withholdingPreview.netPaymentAmount)}원</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 매입 세금계산서 RadioGroup */}
            {showInvoiceSection ? (
              <div className="space-y-2">
                <Label>매입 세금계산서</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <InvoiceOption
                    state="not_required"
                    label="수취 불필요"
                    description="영수증·간이영수증 등"
                  />
                  <InvoiceOption
                    state="not_received"
                    label="미수취"
                    description="발급 받기 전 상태"
                  />
                  <InvoiceOption
                    state="received"
                    label="수취완료"
                    description="세금계산서를 받았음"
                  />
                </div>
                {invoiceState === "received" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="purchase_tax_invoice_date" className="text-xs">
                      수취일
                    </Label>
                    <DateInput
                      id="purchase_tax_invoice_date"
                      value={form.purchase_tax_invoice_date ?? ""}
                      onChange={(value) =>
                        setForm((prev) => ({ ...prev, purchase_tax_invoice_date: value }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
                개인 원천징수 매입은 세금계산서 수취가 필요 없습니다.
              </div>
            )}

            {/* 프로젝트 */}
            {allowProjectSelection ? (
              <div className="space-y-1.5">
                <Label htmlFor="project_id">연결 프로젝트 (선택)</Label>
                <Popover open={projectPopoverOpen} onOpenChange={setProjectPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="project_id"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={projectPopoverOpen}
                      className="h-10 w-full justify-between rounded-xl border border-input/85 bg-background/80 px-3.5 font-normal shadow-sm"
                    >
                      <span
                        className={cn("truncate", !selectedProject && "text-muted-foreground")}
                      >
                        {selectedProjectLabel ?? "프로젝트명, 번호, 고객사 검색..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                  >
                    <Command
                      filter={(value, search) => {
                        const project = sortedProjects.find((item) => item.id === value);
                        if (!project) return 0;
                        const keyword = search.toLowerCase();
                        if (project.name.toLowerCase().includes(keyword)) return 1;
                        if (project.project_number.toLowerCase().includes(keyword)) return 1;
                        if (project.client?.toLowerCase().includes(keyword)) return 1;
                        return 0;
                      }}
                    >
                      <CommandInput placeholder="프로젝트명, 번호, 고객사 검색..." />
                      <CommandList>
                        <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                          {sortedProjects.map((project) => (
                            <CommandItem
                              key={project.id}
                              value={project.id}
                              onSelect={(value) => {
                                const toggled = value === form.project_id ? null : value;
                                setForm((prev) => ({ ...prev, project_id: toggled }));
                                setProjectPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  form.project_id === project.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="truncate">
                                [{project.project_number}] {project.name}
                                {project.client ? ` - ${project.client}` : ""}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedProject ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setForm((prev) => ({ ...prev, project_id: null }))}
                  >
                    프로젝트 연결 해제
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* 비고 */}
            <div className="space-y-1.5">
              <Label htmlFor="exp-memo">비고</Label>
              <Input
                id="exp-memo"
                value={form.memo ?? ""}
                onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                placeholder="메모"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-row-reverse flex-wrap items-center justify-start gap-2 sm:justify-end">
        <Button type="submit" disabled={loading || savingContinue}>
          {loading ? "저장 중..." : expense ? "수정" : "등록"}
        </Button>
        {!expense && onSaveAndContinue ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleSubmitAndContinue()}
            disabled={loading || savingContinue}
          >
            {savingContinue ? "저장 중..." : "저장 후 계속 추가"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading || savingContinue}
        >
          취소
        </Button>
      </div>
    </form>
  );
}

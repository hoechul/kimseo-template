"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Project, Revenue, RevenueChannel, RevenueInsert } from "@/lib/types";

const CHANNEL_OPTIONS: { value: RevenueChannel; label: string }[] = [
  { value: "아임웹", label: "아임웹" },
  { value: "자사몰", label: "자사몰" },
  { value: "기타", label: "기타" },
];

interface ProjectType {
  id: string;
  name: string;
}

interface RevenueFormProps {
  revenue: Revenue | null;
  projectId?: string | null;
  projects?: Project[];
  projectTypes?: ProjectType[];
  allowProjectSelection?: boolean;
  onSave: (data: RevenueInsert) => Promise<void>;
  onCancel: () => void;
}

function createEmptyRevenue(projectId: string | null = null): RevenueInsert {
  return {
    project_id: projectId,
    type_id: null,
    channel: null,
    product_name: null,
    external_order_id: null,
    title: "전액",
    total_amount: 0,
    supply_amount: 0,
    vat_amount: 0,
    vat_included: true,
    revenue_date: "",
    is_paid: false,
    paid_date: "",
    is_tax_invoice_issued: false,
    tax_invoice_not_required: false,
    tax_invoice_date: "",
    expected_payment_date: "",
    memo: "",
  };
}

export function RevenueForm({
  revenue,
  projectId = null,
  projects = [],
  projectTypes = [],
  allowProjectSelection = false,
  onSave,
  onCancel,
}: RevenueFormProps) {
  const [form, setForm] = useState<RevenueInsert>(createEmptyRevenue(projectId));
  const [loading, setLoading] = useState(false);
  const [displaySupply, setDisplaySupply] = useState("");
  const [displayVat, setDisplayVat] = useState("");
  const [displayTotal, setDisplayTotal] = useState("");
  const [projectPopoverOpen, setProjectPopoverOpen] = useState(false);
  const [isUsd, setIsUsd] = useState(false);
  const [isRefund, setIsRefund] = useState(false);
  const [displayUsdAmount, setDisplayUsdAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [revenueDateGuideOpen, setRevenueDateGuideOpen] = useState(false);

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

  useEffect(() => {
    if (revenue) {
      setForm({
        project_id: revenue.project_id,
        type_id: revenue.type_id ?? null,
        channel: revenue.channel ?? null,
        product_name: revenue.product_name ?? null,
        external_order_id: revenue.external_order_id ?? null,
        title: revenue.title,
        total_amount: revenue.total_amount,
        supply_amount: revenue.supply_amount,
        vat_amount: revenue.vat_amount,
        vat_included: revenue.vat_included ?? true,
        revenue_date: revenue.revenue_date ?? "",
        is_paid: revenue.is_paid,
        paid_date: revenue.paid_date ?? "",
        is_tax_invoice_issued: revenue.is_tax_invoice_issued,
        tax_invoice_not_required: revenue.tax_invoice_not_required ?? false,
        tax_invoice_date: revenue.tax_invoice_date ?? "",
        expected_payment_date: revenue.expected_payment_date ?? "",
        memo: revenue.memo ?? "",
      });
      setDisplaySupply(revenue.supply_amount ? Math.abs(revenue.supply_amount).toLocaleString() : "");
      setDisplayVat(revenue.vat_amount ? Math.abs(revenue.vat_amount).toLocaleString() : "");
      setDisplayTotal(revenue.total_amount ? Math.abs(revenue.total_amount).toLocaleString() : "");
      setIsRefund(revenue.total_amount < 0);
    } else {
      setForm(createEmptyRevenue(projectId));
      setDisplaySupply("");
      setDisplayVat("");
      setDisplayTotal("");
      setIsRefund(false);
    }

    setProjectPopoverOpen(false);
    setIsUsd(false);
    setDisplayUsdAmount("");
    setExchangeRate(null);
    setRateDate("");
  }, [projectId, revenue]);

  useEffect(() => {
    if (!isUsd || !form.revenue_date) {
      setExchangeRate(null);
      setRateDate("");
      return;
    }

    let cancelled = false;
    setRateLoading(true);

    fetch(`/api/exchange-rate?date=${form.revenue_date}`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setExchangeRate(data.rate);
          setRateDate(data.date);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExchangeRate(null);
          setRateDate("");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRateLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.revenue_date, isUsd]);

  useEffect(() => {
    if (!isUsd || !exchangeRate || !displayUsdAmount || !rateDate) return;

    const usd = parseFloat(displayUsdAmount.replace(/,/g, "")) || 0;
    if (usd <= 0) return;

    const krw = Math.round(usd * exchangeRate);
    const signed = isRefund ? -krw : krw;
    const supply = Math.round(signed / 1.1);
    const vat = signed - supply;

    setForm((prev) => ({
      ...prev,
      total_amount: signed,
      supply_amount: supply,
      vat_amount: vat,
      vat_included: vat !== 0,
      memo: `$${usd.toLocaleString("en-US")} / 환율 ${exchangeRate.toLocaleString("ko-KR")} (기준일 ${rateDate})`,
    }));
    setDisplaySupply(Math.abs(supply).toLocaleString());
    setDisplayVat(Math.abs(vat).toLocaleString());
    setDisplayTotal(Math.abs(signed).toLocaleString());
  }, [displayUsdAmount, exchangeRate, isUsd, isRefund, rateDate]);

  const formatNumber = (value: number) => value.toLocaleString("ko-KR");

  const parseSigned = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "");
    const magnitude = Number.parseInt(digits, 10) || 0;
    return isRefund ? -magnitude : magnitude;
  };

  const applyAmounts = (supply: number, vat: number, total: number) => {
    setForm((prev) => ({
      ...prev,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: total,
      vat_included: vat !== 0,
    }));
    setDisplaySupply(supply ? Math.abs(supply).toLocaleString() : "");
    setDisplayVat(vat ? Math.abs(vat).toLocaleString() : "");
    setDisplayTotal(total ? Math.abs(total).toLocaleString() : "");
  };

  const handleSupplyChange = (raw: string) => {
    const supply = parseSigned(raw);
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    applyAmounts(supply, vat, total);
  };

  const handleVatChange = (raw: string) => {
    const vat = parseSigned(raw);
    const supply = form.supply_amount;
    const total = supply + vat;
    applyAmounts(supply, vat, total);
  };

  const handleTotalChange = (raw: string) => {
    const total = parseSigned(raw);
    const supply = Math.round(total / 1.1);
    const vat = total - supply;
    applyAmounts(supply, vat, total);
  };

  const handleRefundToggle = () => {
    const nextRefund = !isRefund;
    setIsRefund(nextRefund);
    const sign = nextRefund ? -1 : 1;
    const supply = Math.abs(form.supply_amount) * sign;
    const vat = Math.abs(form.vat_amount) * sign;
    const total = Math.abs(form.total_amount) * sign;
    setForm((prev) => ({
      ...prev,
      supply_amount: supply,
      vat_amount: vat,
      total_amount: total,
      vat_included: vat !== 0,
      ...(nextRefund
        ? { is_tax_invoice_issued: false, tax_invoice_not_required: true, tax_invoice_date: "" }
        : {}),
    }));
    setDisplaySupply(supply ? Math.abs(supply).toLocaleString() : "");
    setDisplayVat(vat ? Math.abs(vat).toLocaleString() : "");
    setDisplayTotal(total ? Math.abs(total).toLocaleString() : "");
  };

  const handleUsdAmountChange = (value: string) => {
    const raw = value.replace(/[^\d.]/g, "");
    const [intPart, ...decParts] = raw.split(".");
    const intFormatted = intPart ? parseInt(intPart, 10).toLocaleString("en-US") : "";
    const display =
      decParts.length > 0
        ? `${intFormatted}.${decParts.join("").slice(0, 2)}`
        : intFormatted;
    setDisplayUsdAmount(display || "");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const payload: RevenueInsert = {
        ...form,
        project_id: form.project_id || null,
        channel: form.channel || null,
        product_name: form.channel ? (form.product_name || null) : null,
        external_order_id: form.channel ? (form.external_order_id || null) : null,
        vat_included: form.vat_amount !== 0,
        revenue_date: form.revenue_date || null,
        expected_payment_date: form.expected_payment_date || null,
        paid_date: form.is_paid ? form.paid_date || null : null,
        is_tax_invoice_issued: form.tax_invoice_not_required ? false : form.is_tax_invoice_issued,
        tax_invoice_date:
          !form.tax_invoice_not_required && form.is_tax_invoice_issued
            ? form.tax_invoice_date || null
            : null,
        memo: form.memo || null,
      };

      await onSave(payload);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {allowProjectSelection && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="project_id">연결 프로젝트</Label>
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
                    <span className={cn("truncate", !selectedProject && "text-muted-foreground")}>
                      {selectedProjectLabel ?? "프로젝트명, 번호, 고객사 검색..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                              const selected = sortedProjects.find((p) => p.id === toggled);
                              setForm((prev) => ({
                                ...prev,
                                project_id: toggled,
                                type_id: toggled ? (selected?.type_id ?? prev.type_id) : prev.type_id,
                              }));
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
              <p className="text-xs text-muted-foreground">
                {selectedProject
                  ? `선택됨: ${selectedProject.project_number} - ${selectedProject.name}`
                  : "프로젝트 없이도 매출 등록은 가능합니다."}
              </p>
              {selectedProject ? (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setForm((prev) => ({ ...prev, project_id: null }))}
                >
                  프로젝트 연결 해제
                </button>
              ) : null}
            </div>
          )}

          {projectTypes.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>매출유형</Label>
              <div className="flex flex-wrap gap-1.5">
                {projectTypes.map((pt) => (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        type_id: prev.type_id === pt.id ? null : pt.id,
                      }))
                    }
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      form.type_id === pt.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {pt.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="channel">판매 채널</Label>
            <div className="flex gap-1.5">
              {CHANNEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      channel: prev.channel === option.value ? null : option.value,
                    }))
                  }
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    form.channel === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {form.channel && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={form.product_name ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, product_name: event.target.value }))
                  }
                  placeholder="상품명"
                />
                <Input
                  value={form.external_order_id ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, external_order_id: event.target.value }))
                  }
                  placeholder="주문번호 (선택)"
                />
              </div>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rev-title">매출 항목명</Label>
            <div className="mb-1.5 flex gap-1.5">
              {["계약금", "중도금", "잔금", "전액"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, title: preset }))}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    form.title === preset
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <Input
              id="rev-title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="매출 항목명"
              required
            />
          </div>

          <div className="space-y-3 sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label>{isRefund ? "환불 금액" : "매출 금액"}</Label>
              <button
                type="button"
                onClick={() => {
                  if (!isUsd) {
                    setIsUsd(true);
                    setDisplayUsdAmount("");
                  } else {
                    setIsUsd(false);
                  }
                }}
                className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                  isUsd
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                $ USD
              </button>
              <button
                type="button"
                onClick={handleRefundToggle}
                className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                  isRefund
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                환불(-)
              </button>
            </div>

            {isUsd && (
              <div className="space-y-1">
                <Label htmlFor="usd_amount" className="text-xs text-muted-foreground">달러 금액</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="usd_amount"
                    type="text"
                    inputMode="decimal"
                    className="pl-7"
                    value={displayUsdAmount}
                    onChange={(event) => handleUsdAmountChange(event.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {rateLoading && (
                  <p className="animate-pulse text-xs text-muted-foreground">환율 조회 중...</p>
                )}
                {exchangeRate && !rateLoading && (
                  <p className="text-xs text-muted-foreground">
                    환율: {exchangeRate.toLocaleString("ko-KR")} / $
                    {rateDate !== form.revenue_date && " (영업일 기준)"}
                  </p>
                )}
                {!exchangeRate && !rateLoading && !form.revenue_date && (
                  <p className="text-xs text-amber-600">매출일을 입력하면 환율을 조회합니다.</p>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="supply_amount" className="text-xs text-muted-foreground">공급가액</Label>
                <Input
                  id="supply_amount"
                  type="text"
                  inputMode="numeric"
                  value={displaySupply}
                  onChange={(event) => handleSupplyChange(event.target.value)}
                  placeholder="0"
                  className={isRefund ? "text-red-600" : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vat_amount" className="text-xs text-muted-foreground">부가세</Label>
                <Input
                  id="vat_amount"
                  type="text"
                  inputMode="numeric"
                  value={displayVat}
                  onChange={(event) => handleVatChange(event.target.value)}
                  placeholder="0"
                  className={isRefund ? "text-red-600" : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="total_amount" className="text-xs text-muted-foreground">매출금액</Label>
                <Input
                  id="total_amount"
                  type="text"
                  inputMode="numeric"
                  value={displayTotal}
                  onChange={(event) => handleTotalChange(event.target.value)}
                  placeholder="0"
                  className={isRefund ? "text-red-600 font-medium" : "font-medium"}
                />
              </div>
            </div>

            {isRefund && form.total_amount !== 0 ? (
              <p className="text-xs text-red-600">
                환불 처리: {formatNumber(form.total_amount)}원 (세금계산서 발행 불필요)
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="revenue_date">매출일</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                onClick={() => setRevenueDateGuideOpen(true)}
              >
                매출일 등록 기준
              </button>
            </div>
            <DateInput
              id="revenue_date"
              value={form.revenue_date ?? ""}
              onChange={(value) => setForm((prev) => ({ ...prev, revenue_date: value }))}
            />
          </div>

          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 sm:items-start">
            <div className="space-y-2">
              <Label htmlFor="expected_payment_date">예상 입금일</Label>
              <DateInput
                id="expected_payment_date"
                value={form.expected_payment_date ?? ""}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, expected_payment_date: value }))
                }
                placeholder="예상 입금일 (선택)"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_paid}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_paid: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                입금완료
              </Label>
              {form.is_paid && (
                <DateInput
                  value={form.paid_date ?? ""}
                  onChange={(value) => setForm((prev) => ({ ...prev, paid_date: value }))}
                  placeholder="입금일"
                />
              )}
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            {isRefund ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                환불 매출은 세금계산서 발행이 자동으로 불필요 처리됩니다.
              </div>
            ) : (
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.tax_invoice_not_required}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      tax_invoice_not_required: event.target.checked,
                      ...(event.target.checked
                        ? { is_tax_invoice_issued: false, tax_invoice_date: "" }
                        : {}),
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                세금계산서 발행 불필요
              </Label>
            )}

            {!isRefund && !form.tax_invoice_not_required && (
              <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_tax_invoice_issued}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          is_tax_invoice_issued: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    세금계산서 발행완료
                  </Label>
                </div>
                <div className="space-y-2">
                  {form.is_tax_invoice_issued && (
                    <>
                      <Label htmlFor="tax_invoice_date">발행일</Label>
                      <DateInput
                        id="tax_invoice_date"
                        value={form.tax_invoice_date ?? ""}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, tax_invoice_date: value }))
                        }
                        placeholder="발행일"
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rev-memo">비고</Label>
            <Input
              id="rev-memo"
              value={form.memo ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
              placeholder="메모"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : revenue ? "수정" : "등록"}
        </Button>
      </div>
      <Dialog open={revenueDateGuideOpen} onOpenChange={setRevenueDateGuideOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>매출일 등록 기준</DialogTitle>
            <DialogDescription>
              돈을 받을 권리가 확정된 날을 매출일로 보면 됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <p>
              쉽게 말해, <strong>서비스나 용역을 다 끝내서 고객에게 청구할 수 있게 된 날</strong>이 매출일입니다.
            </p>
            <p>
              그래서 보통 <strong>실제로 돈이 입금된 날</strong>이 아니라,
              <strong> 서비스나 용역이 완료된 날</strong>을 매출일로 적습니다.
            </p>
            <div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
              <p className="font-medium">한 줄 요약</p>
              <p>돈을 받을 권리가 확정된 날 = 서비스/용역이 완료된 날 = 매출일</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}

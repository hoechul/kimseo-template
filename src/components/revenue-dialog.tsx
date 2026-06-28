"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project, Revenue, RevenueChannel, RevenueInsert } from "@/lib/types";

const CHANNEL_OPTIONS: { value: RevenueChannel; label: string }[] = [
  { value: "아임웹", label: "아임웹" },
  { value: "자사몰", label: "자사몰" },
  { value: "기타", label: "기타" },
];

interface RevenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revenue: Revenue | null;
  projectId?: string | null;
  projects?: Project[];
  allowProjectSelection?: boolean;
  onSave: (data: RevenueInsert) => Promise<void>;
  onSaveAndContinue?: (data: RevenueInsert) => Promise<void>;
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

export function RevenueDialog({
  open,
  onOpenChange,
  revenue,
  projectId = null,
  projects = [],
  allowProjectSelection = false,
  onSave,
  onSaveAndContinue,
}: RevenueDialogProps) {
  const [form, setForm] = useState<RevenueInsert>(createEmptyRevenue(projectId));
  const [loading, setLoading] = useState(false);
  const [displayAmount, setDisplayAmount] = useState("");

  // USD conversion state
  const [isUsd, setIsUsd] = useState(false);
  const [displayUsdAmount, setDisplayUsdAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState("");
  const [rateLoading, setRateLoading] = useState(false);

  const formatNumberWithCommas = (value: string) => {
    const num = value.replace(/[^\d]/g, "");
    return num ? Number(num).toLocaleString() : "";
  };

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
      const initialAmount = (revenue.vat_included ?? true)
        ? revenue.total_amount
        : revenue.supply_amount;
      setDisplayAmount(
        initialAmount ? initialAmount.toLocaleString() : ""
      );
    } else {
      setForm(createEmptyRevenue(projectId));
      setDisplayAmount("");
    }
    setIsUsd(false);
    setDisplayUsdAmount("");
    setExchangeRate(null);
    setRateDate("");
  }, [revenue, projectId, open]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.project_number.localeCompare(b.project_number)),
    [projects]
  );

  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.id === form.project_id) ?? null,
    [sortedProjects, form.project_id]
  );

  // Fetch exchange rate when date changes in USD mode
  useEffect(() => {
    if (!isUsd || !form.revenue_date) {
      setExchangeRate(null);
      setRateDate("");
      return;
    }
    let cancelled = false;
    setRateLoading(true);
    fetch(`/api/exchange-rate?date=${form.revenue_date}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setExchangeRate(data.rate);
          setRateDate(data.date);
        }
      })
      .catch(() => {
        if (!cancelled) setExchangeRate(null);
      })
      .finally(() => {
        if (!cancelled) setRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isUsd, form.revenue_date]);

  // Auto-calculate KRW when rate + USD amount are both available
  useEffect(() => {
    if (!isUsd || !exchangeRate || !displayUsdAmount || !rateDate) return;
    const usd = parseFloat(displayUsdAmount.replace(/,/g, "")) || 0;
    if (usd <= 0) return;
    const krw = Math.round(usd * exchangeRate);
    const amounts = recalcAmounts(krw, form.vat_included);
    setForm((prev) => ({
      ...prev,
      ...amounts,
      memo: `$${usd.toLocaleString("en-US")} × 환율 ${exchangeRate.toLocaleString("ko-KR")}원 (기준일 ${rateDate})`,
    }));
    setDisplayAmount(krw.toLocaleString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUsd, exchangeRate, displayUsdAmount, rateDate, form.vat_included]);

  const recalcAmounts = (amount: number, vatIncluded: boolean) => {
    if (vatIncluded) {
      // 입력금액 = 공급가액 + 부가세 포함된 총액
      const supply = Math.round(amount / 1.1);
      const vat = amount - supply;
      return { total_amount: amount, supply_amount: supply, vat_amount: vat };
    }
    // 부가세 미포함: 입력금액 = 공급가액 그대로, 부가세 0
    return { total_amount: amount, supply_amount: amount, vat_amount: 0 };
  };

  const handleTotalAmountChange = (value: string) => {
    const rawNum = value.replace(/[^\d]/g, "");
    const total = Number.parseInt(rawNum, 10) || 0;
    const amounts = recalcAmounts(total, form.vat_included);

    setForm((prev) => ({
      ...prev,
      ...amounts,
    }));
    setDisplayAmount(formatNumberWithCommas(rawNum));
  };

  const handleUsdAmountChange = (value: string) => {
    const raw = value.replace(/[^\d.]/g, "");
    const [intPart, ...decParts] = raw.split(".");
    const intFormatted = intPart
      ? parseInt(intPart, 10).toLocaleString("en-US")
      : "";
    const display =
      decParts.length > 0
        ? `${intFormatted}.${decParts.join("").slice(0, 2)}`
        : intFormatted;
    setDisplayUsdAmount(display || "");
  };

  const handleVatIncludedChange = (checked: boolean) => {
    // In USD mode, recalculate from the USD amount
    if (isUsd && exchangeRate && displayUsdAmount) {
      const usd = parseFloat(displayUsdAmount.replace(/,/g, "")) || 0;
      if (usd > 0) {
        const krw = Math.round(usd * exchangeRate);
        const amounts = recalcAmounts(krw, checked);
        setForm((prev) => ({ ...prev, vat_included: checked, ...amounts }));
        setDisplayAmount(krw.toLocaleString());
        return;
      }
    }
    const currentInput =
      Number.parseInt(displayAmount.replace(/[^\d]/g, ""), 10) || 0;
    const amounts = recalcAmounts(currentInput, checked);
    setForm((prev) => ({
      ...prev,
      vat_included: checked,
      ...amounts,
    }));
  };

  const handleSupplyAmountChange = (value: string) => {
    const supply = Number.parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    const total = supply + form.vat_amount;
    setForm((prev) => ({
      ...prev,
      supply_amount: supply,
      total_amount: total,
    }));
    setDisplayAmount(total ? total.toLocaleString() : "");
  };

  const handleVatAmountChange = (value: string) => {
    const vat = Number.parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
    const total = form.supply_amount + vat;
    setForm((prev) => ({
      ...prev,
      vat_amount: vat,
      total_amount: total,
    }));
    setDisplayAmount(total ? total.toLocaleString() : "");
  };

  const buildPayload = (): RevenueInsert => ({
    ...form,
    project_id: form.project_id || null,
    channel: form.channel || null,
    product_name: form.channel ? (form.product_name || null) : null,
    external_order_id: form.channel ? (form.external_order_id || null) : null,
    revenue_date: form.revenue_date || null,
    expected_payment_date: form.expected_payment_date || null,
    paid_date: form.is_paid ? form.paid_date || null : null,
    is_tax_invoice_issued: form.tax_invoice_not_required
      ? false
      : form.is_tax_invoice_issued,
    tax_invoice_date:
      !form.tax_invoice_not_required && form.is_tax_invoice_issued
        ? form.tax_invoice_date || null
        : null,
    memo: form.memo || null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(buildPayload());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!onSaveAndContinue) return;
    setLoading(true);
    try {
      await onSaveAndContinue(buildPayload());
      // 폼 초기화 (프로젝트 ID 유지)
      setForm(createEmptyRevenue(projectId));
      setDisplayAmount("");
      setIsUsd(false);
      setDisplayUsdAmount("");
      setExchangeRate(null);
      setRateDate("");
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (n: number) => n.toLocaleString("ko-KR");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{revenue ? "매출 수정" : "매출 등록"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {allowProjectSelection && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="project_id">연결 프로젝트</Label>
                <select
                  id="project_id"
                  value={form.project_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      project_id: e.target.value || null,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">프로젝트 미지정</option>
                  {sortedProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_number} · {project.name}
                    </option>
                  ))}
                </select>
                {selectedProject ? (
                  <p className="text-xs text-muted-foreground">
                    선택됨: {selectedProject.project_number} · {selectedProject.name}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    프로젝트 없는 매출도 등록 가능합니다.
                  </p>
                )}
              </div>
            )}

            {/* 판매채널 */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="channel">판매채널</Label>
              <div className="flex gap-1.5">
                {CHANNEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        channel: prev.channel === opt.value ? null : opt.value,
                      }))
                    }
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      form.channel === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {form.channel && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={form.product_name ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, product_name: e.target.value }))
                    }
                    placeholder="상품명"
                  />
                  <Input
                    value={form.external_order_id ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, external_order_id: e.target.value }))
                    }
                    placeholder="주문번호 (선택)"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rev-title">매출 항목명 *</Label>
              <div className="flex gap-1.5 mb-1.5">
                {["계약금", "중도금", "잔금", "전액"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, title: preset }))
                    }
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
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="매출 항목명"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor={isUsd ? "usd_amount" : "total_amount"}>
                  {isUsd ? "달러 금액" : "매출금액"}
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    if (!isUsd) {
                      setIsUsd(true);
                      setDisplayUsdAmount("");
                    } else {
                      setIsUsd(false);
                      const currentInput = form.vat_included
                        ? form.total_amount
                        : form.supply_amount;
                      setDisplayAmount(
                        currentInput ? currentInput.toLocaleString() : ""
                      );
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
              </div>
              <div className="flex gap-1.5">
                {[
                  { value: true, label: "부가세 포함" },
                  { value: false, label: "부가세 미포함" },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => handleVatIncludedChange(opt.value)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      form.vat_included === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {isUsd ? (
                <>
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
                      onChange={(e) => handleUsdAmountChange(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  {rateLoading && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      환율 조회 중...
                    </p>
                  )}
                  {exchangeRate && !rateLoading && (
                    <p className="text-xs text-muted-foreground">
                      환율: {exchangeRate.toLocaleString("ko-KR")}원/$
                      {rateDate !== form.revenue_date && " (영업일 기준)"}
                    </p>
                  )}
                  {!exchangeRate && !rateLoading && !form.revenue_date && (
                    <p className="text-xs text-amber-600">
                      매출일을 입력하면 환율이 자동 조회됩니다
                    </p>
                  )}
                  {form.total_amount > 0 && exchangeRate && (
                    <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-medium">
                      → {formatNumber(form.total_amount)}원
                    </div>
                  )}
                </>
              ) : (
                <Input
                  id="total_amount"
                  type="text"
                  inputMode="numeric"
                  value={displayAmount}
                  onChange={(e) => handleTotalAmountChange(e.target.value)}
                  placeholder="0"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenue_date">매출일</Label>
              <DateInput
                id="revenue_date"
                value={form.revenue_date ?? ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, revenue_date: v }))
                }
              />
            </div>

            {form.vat_included && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="supply_amount">공급가액</Label>
                  <Input
                    id="supply_amount"
                    type="text"
                    inputMode="numeric"
                    value={form.supply_amount ? formatNumber(form.supply_amount) : ""}
                    onChange={(e) => handleSupplyAmountChange(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vat_amount">부가세액</Label>
                  <Input
                    id="vat_amount"
                    type="text"
                    inputMode="numeric"
                    value={form.vat_amount ? formatNumber(form.vat_amount) : ""}
                    onChange={(e) => handleVatAmountChange(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="expected_payment_date">예상입금일</Label>
              <DateInput
                id="expected_payment_date"
                value={form.expected_payment_date ?? ""}
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, expected_payment_date: v }))
                }
                placeholder="예상입금일 (선택)"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_paid}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, is_paid: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                입금완료
              </Label>
              {form.is_paid && (
                <DateInput
                  value={form.paid_date ?? ""}
                  onChange={(v) =>
                    setForm((prev) => ({ ...prev, paid_date: v }))
                  }
                  placeholder="입금일"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.tax_invoice_not_required}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      tax_invoice_not_required: e.target.checked,
                      ...(e.target.checked
                        ? { is_tax_invoice_issued: false, tax_invoice_date: "" }
                        : {}),
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                세금계산서 발행 불필요
              </Label>
              {!form.tax_invoice_not_required && (
                <>
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_tax_invoice_issued}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          is_tax_invoice_issued: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    세금계산서 발행완료
                  </Label>
                  {form.is_tax_invoice_issued && (
                    <DateInput
                      value={form.tax_invoice_date ?? ""}
                      onChange={(v) =>
                        setForm((prev) => ({
                          ...prev,
                          tax_invoice_date: v,
                        }))
                      }
                      placeholder="발행일"
                    />
                  )}
                </>
              )}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rev-memo">비고</Label>
              <Input
                id="rev-memo"
                value={form.memo ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, memo: e.target.value }))
                }
                placeholder="메모"
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              취소
            </Button>
            {!revenue && onSaveAndContinue && (
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={handleSaveAndContinue}
              >
                {loading ? "저장 중..." : "저장 후 계속 추가"}
              </Button>
            )}
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : revenue ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

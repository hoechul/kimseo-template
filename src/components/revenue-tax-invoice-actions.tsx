"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, LoaderCircle, ReceiptText, RefreshCw, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
  type TextareaHTMLAttributes,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BoltaTaxInvoiceIssueRequest } from "@/lib/bolta";
import {
  getRevenueTaxInvoiceBadgeClassName,
  getRevenueTaxInvoiceBadgeVariant,
  getRevenueTaxInvoiceIssuingAgeMinutes,
  getRevenueTaxInvoiceLabel,
  getRevenueTaxInvoiceState,
  isRevenueTaxInvoiceIssuingStale,
} from "@/lib/revenue-tax-invoice";
import { getTaxInvoicePreviewMissingFields } from "@/lib/tax-invoice-preview";
import type { Revenue } from "@/lib/types";
import { cn } from "@/lib/utils";

type TaxInvoicePreview = BoltaTaxInvoiceIssueRequest;

type TaxInvoicePreviewResponse = {
  canIssue: boolean;
  taxInvoiceState: string;
  missingFields: string[];
  blockedReasons: string[];
  nonEditableBlockedReasons: string[];
  preview: TaxInvoicePreview;
};

type TaxInvoiceMutationResponse = {
  success?: boolean;
  resolved?: boolean;
  stale?: boolean;
  message?: string;
  error?: string;
  data?: Revenue | null;
};

interface RevenueTaxInvoiceActionsProps {
  revenue: Revenue;
  onRevenueUpdated?: (revenue: Revenue) => void;
  className?: string;
}

function getTaxInvoiceStateBlockedReasons(taxInvoiceState: string) {
  if (taxInvoiceState === "not_required") {
    return ["세금계산서 발행 대상이 아닌 매출입니다."];
  }

  if (taxInvoiceState === "issued") {
    return ["이미 세금계산서가 발행된 매출입니다."];
  }

  if (taxInvoiceState === "issuing") {
    return ["세금계산서 발행이 진행 중입니다."];
  }

  return [];
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatBusinessNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 10)}`;
}

function parseBusinessNumber(value: string) {
  return value.replace(/[^\d-]/g, "").replace(/-/g, "");
}

function parseNumberInput(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function RevenueTaxInvoiceActions({
  revenue,
  onRevenueUpdated,
  className,
}: RevenueTaxInvoiceActionsProps) {
  const [issuing, setIssuing] = useState(false);
  const [syncingTaxInvoice, setSyncingTaxInvoice] = useState(false);
  const [resettingTaxInvoice, setResettingTaxInvoice] = useState(false);
  const [forceCancelOpen, setForceCancelOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [issuePreview, setIssuePreview] = useState<TaxInvoicePreviewResponse | null>(null);
  const [issueDraft, setIssueDraft] = useState<TaxInvoicePreview | null>(null);

  const taxInvoiceState = getRevenueTaxInvoiceState(revenue);
  const taxInvoiceLabel = getRevenueTaxInvoiceLabel(revenue);
  const taxInvoiceBadgeClassName = getRevenueTaxInvoiceBadgeClassName(revenue);
  const taxInvoiceIssuingAgeMinutes = getRevenueTaxInvoiceIssuingAgeMinutes(revenue);
  const isTaxInvoiceIssuingStale = isRevenueTaxInvoiceIssuingStale(revenue);
  const hasTaxInvoiceTrackingInfo = Boolean(
    revenue.tax_invoice_client_reference_id || revenue.tax_invoice_issuance_key
  );
  const canIssueTaxInvoice =
    !revenue.tax_invoice_not_required &&
    taxInvoiceState !== "issued" &&
    taxInvoiceState !== "issuing";
  const issueButtonLabel = taxInvoiceState === "failed" ? "재발행" : "세금계산서 발행";
  const canSyncTaxInvoice =
    !revenue.tax_invoice_not_required &&
    taxInvoiceState !== "issued" &&
    hasTaxInvoiceTrackingInfo;

  const draftMissingFields = useMemo(
    () => (issueDraft ? getTaxInvoicePreviewMissingFields(issueDraft) : []),
    [issueDraft]
  );
  const previewBlockedReasons = useMemo(() => {
    if (!issuePreview) return [];
    return [
      ...new Set([
        ...(issuePreview.nonEditableBlockedReasons ??
          getTaxInvoiceStateBlockedReasons(issuePreview.taxInvoiceState)),
        ...draftMissingFields,
      ]),
    ];
  }, [draftMissingFields, issuePreview]);
  const canSubmitIssue =
    !!issueDraft &&
    previewBlockedReasons.length === 0 &&
    !previewLoading &&
    !previewError &&
    !issuing;

  const loadIssuePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await fetch(`/api/revenues/${revenue.id}/tax-invoice`);
      const payload = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<TaxInvoicePreviewResponse>)
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "세금계산서 발행 정보를 불러오지 못했습니다.");
      }

      setIssuePreview(payload as TaxInvoicePreviewResponse);
      setIssueDraft((payload as TaxInvoicePreviewResponse).preview);
    } catch (error) {
      setIssuePreview(null);
      setIssueDraft(null);
      setPreviewError(
        error instanceof Error
          ? error.message
          : "세금계산서 발행 정보를 불러오지 못했습니다."
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [revenue.id]);

  useEffect(() => {
    if (!previewOpen) return;
    void loadIssuePreview();
  }, [loadIssuePreview, previewOpen]);

  const handleSyncTaxInvoice = async () => {
    setSyncingTaxInvoice(true);

    try {
      const response = await fetch(`/api/revenues/${revenue.id}/tax-invoice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const payload = (await response.json().catch(() => null)) as TaxInvoiceMutationResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "세금계산서 상태를 재확인하지 못했습니다.");
      }

      if (payload?.data) onRevenueUpdated?.(payload.data);

      if (payload?.resolved) {
        toast.success(payload.message || "세금계산서 상태를 반영했습니다.");
      } else {
        toast.warning(payload?.message || "아직 최종 발행 결과를 확인하지 못했습니다.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "세금계산서 상태 재확인 중 오류가 발생했습니다."
      );
    } finally {
      setSyncingTaxInvoice(false);
    }
  };

  const handleForceCancelTaxInvoice = async () => {
    setResettingTaxInvoice(true);

    try {
      const response = await fetch(`/api/revenues/${revenue.id}/tax-invoice`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force-reset" }),
      });
      const payload = (await response.json().catch(() => null)) as TaxInvoiceMutationResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "발행을 강제 취소하지 못했습니다.");
      }

      if (payload?.data) onRevenueUpdated?.(payload.data);

      setForceCancelOpen(false);
      toast.success(
        "발행중 상태를 강제 취소했습니다. 볼타 관리자 화면에서 실제 발행 여부를 반드시 확인하세요."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "강제 취소 중 오류가 발생했습니다."
      );
    } finally {
      setResettingTaxInvoice(false);
    }
  };

  const handleIssueTaxInvoice = async () => {
    if (!issueDraft) return;

    setIssuing(true);

    try {
      const response = await fetch(`/api/revenues/${revenue.id}/tax-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: issueDraft }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            missingFields?: string[];
            blockedReasons?: string[];
            nonEditableBlockedReasons?: string[];
            preview?: TaxInvoicePreview;
            data?: Revenue | null;
          }
        | null;

      if (!response.ok) {
        if (payload?.data) onRevenueUpdated?.(payload.data);
        if (payload?.preview) setIssueDraft(payload.preview);

        if (payload?.missingFields || payload?.blockedReasons) {
          setIssuePreview((prev) =>
            prev
              ? {
                  ...prev,
                  missingFields: payload.missingFields ?? [],
                  blockedReasons: payload.blockedReasons ?? [],
                  nonEditableBlockedReasons: payload.nonEditableBlockedReasons ?? [],
                }
              : prev
          );
        }

        throw new Error(payload?.error || "세금계산서 발행 요청에 실패했습니다.");
      }

      if (payload?.data) onRevenueUpdated?.(payload.data);
      setPreviewOpen(false);
      setIssuePreview(null);
      setIssueDraft(null);
      toast.success(
        "세금계산서 발행을 요청했습니다. 결과 웹훅이 도착하면 상태가 자동으로 반영됩니다."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "세금계산서 발행 요청 중 오류가 발생했습니다."
      );
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={getRevenueTaxInvoiceBadgeVariant(revenue)}
          className={taxInvoiceBadgeClassName}
        >
          {taxInvoiceLabel}
        </Badge>
        {revenue.tax_invoice_error_message ? (
          <span className="text-xs text-rose-700">{revenue.tax_invoice_error_message}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {canSyncTaxInvoice ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleSyncTaxInvoice()}
            disabled={syncingTaxInvoice || issuing || resettingTaxInvoice}
          >
            <RefreshCw className={cn("h-4 w-4", syncingTaxInvoice && "animate-spin")} />
            상태 재확인
          </Button>
        ) : null}

        {taxInvoiceState === "issuing" ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setForceCancelOpen(true)}
            disabled={resettingTaxInvoice || issuing || syncingTaxInvoice}
          >
            {resettingTaxInvoice ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {resettingTaxInvoice ? "취소 중..." : "강제 취소"}
          </Button>
        ) : null}

        {revenue.tax_invoice_url ? (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href={revenue.tax_invoice_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              세금계산서 보기
            </Link>
          </Button>
        ) : null}

        {!revenue.tax_invoice_not_required ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            disabled={!canIssueTaxInvoice || issuing || syncingTaxInvoice || resettingTaxInvoice}
          >
            {taxInvoiceState === "issuing" || issuing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ReceiptText className="h-4 w-4" />
            )}
            {taxInvoiceState === "issuing" || issuing ? "발행중" : issueButtonLabel}
          </Button>
        ) : null}
      </div>

      {taxInvoiceState === "issuing" ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            isTaxInvoiceIssuingStale
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-sky-200 bg-sky-50 text-sky-800"
          )}
        >
          {isTaxInvoiceIssuingStale && taxInvoiceIssuingAgeMinutes !== null
            ? `세금계산서 발행 결과가 ${taxInvoiceIssuingAgeMinutes}분째 반영되지 않았습니다. 상태 재확인 또는 강제 취소가 가능합니다.`
            : "Bolta 발행 결과 웹훅을 기다리는 중입니다."}
        </div>
      ) : null}

      <IssuePreviewDialog
        open={previewOpen}
        onOpenChange={(nextOpen) => {
          setPreviewOpen(nextOpen);
          if (!nextOpen) {
            setPreviewError(null);
            setIssuePreview(null);
            setIssueDraft(null);
          }
        }}
        previewLoading={previewLoading}
        previewError={previewError}
        issuePreview={issuePreview}
        issueDraft={issueDraft}
        setIssueDraft={setIssueDraft}
        previewBlockedReasons={previewBlockedReasons}
        canSubmitIssue={canSubmitIssue}
        issuing={issuing}
        onIssue={handleIssueTaxInvoice}
      />

      <ForceCancelDialog
        open={forceCancelOpen}
        onOpenChange={(nextOpen) => {
          if (resettingTaxInvoice) return;
          setForceCancelOpen(nextOpen);
        }}
        resettingTaxInvoice={resettingTaxInvoice}
        taxInvoiceIssuingAgeMinutes={taxInvoiceIssuingAgeMinutes}
        onForceCancel={handleForceCancelTaxInvoice}
      />
    </div>
  );
}

function IssuePreviewDialog({
  open,
  onOpenChange,
  previewLoading,
  previewError,
  issuePreview,
  issueDraft,
  setIssueDraft,
  previewBlockedReasons,
  canSubmitIssue,
  issuing,
  onIssue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewLoading: boolean;
  previewError: string | null;
  issuePreview: TaxInvoicePreviewResponse | null;
  issueDraft: TaxInvoicePreview | null;
  setIssueDraft: Dispatch<SetStateAction<TaxInvoicePreview | null>>;
  previewBlockedReasons: string[];
  canSubmitIssue: boolean;
  issuing: boolean;
  onIssue: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>세금계산서 발행</DialogTitle>
          <DialogDescription>
            발행 전에 실제 전송될 정보를 확인하세요. 필수 항목이 누락되면 발행할 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        {previewLoading ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            세금계산서 발행 정보를 불러오는 중입니다.
          </div>
        ) : previewError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {previewError}
          </div>
        ) : issuePreview && issueDraft ? (
          <TaxInvoiceDraftForm
            issueDraft={issueDraft}
            setIssueDraft={setIssueDraft}
            previewBlockedReasons={previewBlockedReasons}
          />
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={issuing}>
            닫기
          </Button>
          <Button onClick={() => void onIssue()} disabled={!canSubmitIssue}>
            {issuing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ReceiptText className="h-4 w-4" />
            )}
            {issuing ? "발행 요청 중..." : "발행 요청"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaxInvoiceDraftForm({
  issueDraft,
  setIssueDraft,
  previewBlockedReasons,
}: {
  issueDraft: TaxInvoicePreview;
  setIssueDraft: Dispatch<SetStateAction<TaxInvoicePreview | null>>;
  previewBlockedReasons: string[];
}) {
  return (
    <div className="space-y-4">
      {previewBlockedReasons.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-700">
            발행 전에 확인이 필요한 항목이 있습니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {previewBlockedReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          연결된 정보를 기본값으로 불러왔습니다. 수정 후 발행할 수 있습니다.
        </div>
      )}

      <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <legend className="px-2 text-sm font-semibold">기본 정보</legend>
        <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
          <Label htmlFor="issue-date" className="text-right text-sm text-muted-foreground">발행일</Label>
          <Input
            id="issue-date"
            type="date"
            value={issueDraft.date}
            onChange={(event) =>
              setIssueDraft((prev) => (prev ? { ...prev, date: event.target.value } : prev))
            }
          />
          <Label htmlFor="issue-purpose" className="text-right text-sm text-muted-foreground">발행 구분</Label>
          <select
            id="issue-purpose"
            className="flex h-10 w-full rounded-xl border border-input/85 bg-background/80 px-3.5 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow,border-color,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={issueDraft.purpose}
            onChange={(event) =>
              setIssueDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      purpose: event.target.value === "RECEIPT" ? "RECEIPT" : "CLAIM",
                    }
                  : prev
              )
            }
          >
            <option value="CLAIM">청구</option>
            <option value="RECEIPT">영수</option>
          </select>
          <Label htmlFor="issue-description" className="self-start pt-2.5 text-right text-sm text-muted-foreground">설명</Label>
          <IssueTextarea
            id="issue-description"
            value={issueDraft.description ?? ""}
            onChange={(event) =>
              setIssueDraft((prev) =>
                prev ? { ...prev, description: event.target.value } : prev
              )
            }
          />
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <legend className="px-2 text-sm font-semibold">품목</legend>
        <div className="space-y-3">
          {issueDraft.items.map((item, index) => (
            <div
              key={`tax-invoice-item-${index}`}
              className="rounded-xl border border-border/60 bg-background/70 p-3"
            >
              <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
                <Label htmlFor={`issue-item-name-${index}`} className="text-right text-sm text-muted-foreground">품목명</Label>
                <Input
                  id={`issue-item-name-${index}`}
                  value={item.name}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, name: event.target.value }
                                : current
                            ),
                          }
                        : prev
                    )
                  }
                />
                <Label htmlFor={`issue-item-date-${index}`} className="text-right text-sm text-muted-foreground">일자</Label>
                <Input
                  id={`issue-item-date-${index}`}
                  type="date"
                  value={item.date}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, date: event.target.value }
                                : current
                            ),
                          }
                        : prev
                    )
                  }
                />
                <Label htmlFor={`issue-item-quantity-${index}`} className="text-right text-sm text-muted-foreground">수량</Label>
                <Input
                  id={`issue-item-quantity-${index}`}
                  type="number"
                  min="1"
                  value={item.quantity ?? 1}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.map((current, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...current,
                                    quantity: parseNumberInput(
                                      event.target.value,
                                      current.quantity ?? 1
                                    ),
                                  }
                                : current
                            ),
                          }
                        : prev
                    )
                  }
                />
                <Label htmlFor={`issue-item-supply-${index}`} className="text-right text-sm text-muted-foreground">공급가액</Label>
                <Input
                  id={`issue-item-supply-${index}`}
                  inputMode="numeric"
                  value={formatNumber(item.supplyCost)}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.map((current, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...current,
                                    supplyCost: parseNumberInput(
                                      event.target.value,
                                      current.supplyCost
                                    ),
                                    unitPrice: parseNumberInput(
                                      event.target.value,
                                      current.unitPrice ?? current.supplyCost
                                    ),
                                  }
                                : current
                            ),
                          }
                        : prev
                    )
                  }
                />
                <Label htmlFor={`issue-item-tax-${index}`} className="text-right text-sm text-muted-foreground">세액</Label>
                <Input
                  id={`issue-item-tax-${index}`}
                  inputMode="numeric"
                  value={formatNumber(item.tax ?? 0)}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.map((current, currentIndex) =>
                              currentIndex === index
                                ? {
                                    ...current,
                                    tax: parseNumberInput(event.target.value, current.tax ?? 0),
                                  }
                                : current
                            ),
                          }
                        : prev
                    )
                  }
                />
                <Label htmlFor={`issue-item-description-${index}`} className="self-start pt-2.5 text-right text-sm text-muted-foreground">품목 설명</Label>
                <IssueTextarea
                  id={`issue-item-description-${index}`}
                  value={item.description ?? ""}
                  onChange={(event) =>
                    setIssueDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            items: prev.items.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, description: event.target.value }
                                : current
                            ),
                          }
                        : prev
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <PartyFieldset
        title="공급자"
        idPrefix="supplier"
        party={issueDraft.supplier}
        manager={issueDraft.supplier.manager}
        onChange={(patch) =>
          setIssueDraft((prev) =>
            prev ? { ...prev, supplier: { ...prev.supplier, ...patch } } : prev
          )
        }
        onManagerChange={(patch) =>
          setIssueDraft((prev) =>
            prev
              ? {
                  ...prev,
                  supplier: {
                    ...prev.supplier,
                    manager: { ...prev.supplier.manager, ...patch },
                  },
                }
              : prev
          )
        }
      />

      <PartyFieldset
        title="공급받는자"
        idPrefix="recipient"
        party={issueDraft.supplied}
        manager={issueDraft.supplied.managers[0] ?? { email: "" }}
        onChange={(patch) =>
          setIssueDraft((prev) =>
            prev ? { ...prev, supplied: { ...prev.supplied, ...patch } } : prev
          )
        }
        onManagerChange={(patch) =>
          setIssueDraft((prev) =>
            prev
              ? {
                  ...prev,
                  supplied: {
                    ...prev.supplied,
                    managers: [{ ...prev.supplied.managers[0], email: "", ...patch }],
                  },
                }
              : prev
          )
        }
      />
    </div>
  );
}

function PartyFieldset({
  title,
  idPrefix,
  party,
  manager,
  onChange,
  onManagerChange,
}: {
  title: string;
  idPrefix: string;
  party: {
    identificationNumber: string;
    organizationName: string;
    representativeName: string;
    address?: string;
  };
  manager: {
    email: string;
    name?: string;
    telephone?: string;
  };
  onChange: (patch: Partial<typeof party>) => void;
  onManagerChange: (patch: Partial<typeof manager>) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3 gap-y-2">
        <Label htmlFor={`${idPrefix}-business-number`} className="text-right text-sm text-muted-foreground">사업자번호</Label>
        <Input
          id={`${idPrefix}-business-number`}
          placeholder="000-00-00000"
          value={formatBusinessNumber(party.identificationNumber)}
          onChange={(event) =>
            onChange({ identificationNumber: parseBusinessNumber(event.target.value) })
          }
        />
        <Label htmlFor={`${idPrefix}-organization-name`} className="text-right text-sm text-muted-foreground">상호</Label>
        <Input
          id={`${idPrefix}-organization-name`}
          value={party.organizationName}
          onChange={(event) => onChange({ organizationName: event.target.value })}
        />
        <Label htmlFor={`${idPrefix}-representative-name`} className="text-right text-sm text-muted-foreground">대표자명</Label>
        <Input
          id={`${idPrefix}-representative-name`}
          value={party.representativeName}
          onChange={(event) => onChange({ representativeName: event.target.value })}
        />
        <Label htmlFor={`${idPrefix}-address`} className="text-right text-sm text-muted-foreground">주소</Label>
        <Input
          id={`${idPrefix}-address`}
          value={party.address ?? ""}
          onChange={(event) => onChange({ address: event.target.value })}
        />
        <Label htmlFor={`${idPrefix}-manager-name`} className="text-right text-sm text-muted-foreground">담당자명</Label>
        <Input
          id={`${idPrefix}-manager-name`}
          value={manager.name ?? ""}
          onChange={(event) => onManagerChange({ name: event.target.value })}
        />
        <Label htmlFor={`${idPrefix}-manager-email`} className="text-right text-sm text-muted-foreground">이메일</Label>
        <Input
          id={`${idPrefix}-manager-email`}
          type="email"
          value={manager.email}
          onChange={(event) => onManagerChange({ email: event.target.value })}
        />
        <Label htmlFor={`${idPrefix}-manager-phone`} className="text-right text-sm text-muted-foreground">연락처</Label>
        <Input
          id={`${idPrefix}-manager-phone`}
          value={manager.telephone ?? ""}
          onChange={(event) => onManagerChange({ telephone: event.target.value })}
        />
      </div>
    </fieldset>
  );
}

function ForceCancelDialog({
  open,
  onOpenChange,
  resettingTaxInvoice,
  taxInvoiceIssuingAgeMinutes,
  onForceCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resettingTaxInvoice: boolean;
  taxInvoiceIssuingAgeMinutes: number | null;
  onForceCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
            세금계산서 발행 강제 취소
          </DialogTitle>
          <DialogDescription>
            발행중 상태를 수동으로 해제합니다. 진행 전에 아래 내용을 반드시 확인해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <p className="font-semibold">볼타 세금계산서 발행 구조</p>
            <p className="mt-1 leading-relaxed">
              볼타에 발행 요청을 보내면 <strong>발행대기</strong> 상태로 접수되고,
              약 <strong>10분 후</strong> 결과 웹훅이 도착해 최종 상태가 결정됩니다.
              이 작업은 서비스의 `발행중` 상태만 <strong>failed</strong>로 바꿀 뿐,
              볼타 쪽 발행 요청 자체를 취소하지는 못합니다.
            </p>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
            <p className="font-semibold">강제 취소 시 발생할 수 있는 문제</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
              <li>
                강제 취소 후에도 10분 뒤 웹훅이 <strong>발행 완료</strong>로 도착하면,
                상태가 다시 `발행 완료`로 덮어써져 취소 기록과 정합성이 맞지 않게 됩니다.
              </li>
              <li>
                취소했다고 판단해 같은 건을 재발행하면 볼타에 <strong>중복 발행</strong>이
                발생할 수 있으니, 반드시 볼타 관리자 화면에서 실제 발행 여부를 먼저 확인하세요.
              </li>
              <li>
                402/네트워크 오류로 요청 자체가 실패해 `발행중`만 남은 경우라면 중복 위험은 없지만,
                확실하지 않다면 먼저 <strong>상태 재확인</strong>을 실행해 보세요.
              </li>
            </ul>
          </div>

          {taxInvoiceIssuingAgeMinutes !== null ? (
            <div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-muted-foreground">
              현재 발행 요청 후 <strong>{taxInvoiceIssuingAgeMinutes}분</strong> 경과했습니다.
              {taxInvoiceIssuingAgeMinutes < 10
                ? " 볼타 웹훅이 아직 도착할 가능성이 높은 시점입니다."
                : " 웹훅 도착 예상 시점을 지났지만, 늦게 도착할 수도 있습니다."}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resettingTaxInvoice}
          >
            닫기
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onForceCancel()}
            disabled={resettingTaxInvoice}
          >
            {resettingTaxInvoice ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {resettingTaxInvoice ? "취소 중..." : "위험을 감수하고 강제 취소"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssueTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-xl border border-input/85 bg-background/80 px-3.5 py-2 text-sm shadow-sm outline-none transition-[color,box-shadow,border-color,background-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}

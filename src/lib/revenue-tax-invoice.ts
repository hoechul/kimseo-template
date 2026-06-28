import type { Revenue } from "@/lib/types";

export type RevenueTaxInvoiceState =
  | "not_required"
  | "not_issued"
  | "issuing"
  | "issued"
  | "failed";

export const REVENUE_TAX_INVOICE_STALE_MINUTES = 10;

type RevenueTaxInvoiceShape = Pick<
  Revenue,
  "tax_invoice_not_required" | "is_tax_invoice_issued" | "tax_invoice_issue_status"
>;

type RevenueTaxInvoiceIssuingShape = RevenueTaxInvoiceShape & Pick<
  Revenue,
  "tax_invoice_issue_requested_at"
>;

export function getRevenueTaxInvoiceState(
  revenue: RevenueTaxInvoiceShape
): RevenueTaxInvoiceState {
  if (revenue.tax_invoice_not_required) return "not_required";
  if (revenue.is_tax_invoice_issued || revenue.tax_invoice_issue_status === "issued") {
    return "issued";
  }
  if (revenue.tax_invoice_issue_status === "issuing") return "issuing";
  if (revenue.tax_invoice_issue_status === "failed") return "failed";
  return "not_issued";
}

export function getRevenueTaxInvoiceLabel(
  revenue: RevenueTaxInvoiceShape
): string {
  const state = getRevenueTaxInvoiceState(revenue);

  switch (state) {
    case "not_required":
      return "발행 불필요";
    case "issuing":
      return "발행중";
    case "issued":
      return "발행 완료";
    case "failed":
      return "발행 실패";
    default:
      return "미발행";
  }
}

export function getRevenueTaxInvoiceSortRank(
  revenue: RevenueTaxInvoiceShape
): number {
  const state = getRevenueTaxInvoiceState(revenue);

  switch (state) {
    case "issued":
      return 3;
    case "issuing":
      return 2;
    case "failed":
      return 1;
    case "not_required":
      return 4;
    default:
      return 0;
  }
}

export function getRevenueTaxInvoiceBadgeVariant(
  revenue: RevenueTaxInvoiceShape
): "default" | "secondary" | "outline" | "destructive" {
  const state = getRevenueTaxInvoiceState(revenue);

  switch (state) {
    case "issued":
      return "default";
    case "not_required":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function getRevenueTaxInvoiceBadgeClassName(
  revenue: RevenueTaxInvoiceShape
): string | undefined {
  const state = getRevenueTaxInvoiceState(revenue);

  switch (state) {
    case "issuing":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "issued":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "not_required":
      return "border-border/70 bg-background/80 text-muted-foreground";
    case "not_issued":
      return "border-orange-300 bg-orange-50 text-orange-700";
    default:
      return undefined;
  }
}

export function getRevenueTaxInvoiceIssuingAgeMinutes(
  revenue: RevenueTaxInvoiceIssuingShape,
  now = Date.now()
): number | null {
  if (getRevenueTaxInvoiceState(revenue) !== "issuing") {
    return null;
  }

  if (!revenue.tax_invoice_issue_requested_at) {
    return null;
  }

  const requestedAt = new Date(revenue.tax_invoice_issue_requested_at).getTime();
  if (Number.isNaN(requestedAt)) {
    return null;
  }

  return Math.max(0, Math.floor((now - requestedAt) / 60_000));
}

export function isRevenueTaxInvoiceIssuingStale(
  revenue: RevenueTaxInvoiceIssuingShape,
  now = Date.now(),
  staleMinutes = REVENUE_TAX_INVOICE_STALE_MINUTES
): boolean {
  const ageMinutes = getRevenueTaxInvoiceIssuingAgeMinutes(revenue, now);
  return ageMinutes !== null && ageMinutes >= staleMinutes;
}

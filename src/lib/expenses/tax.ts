import type { VendorTaxCategory } from "@/lib/types";

export const PERSONAL_WITHHOLDING_RATE = 0.033;

export interface CalcWithholdingInput {
  totalAmount: number;
  taxCategory: VendorTaxCategory | null;
  withholdingRate?: number | null;
}

export interface CalcWithholdingResult {
  withholdingAmount: number;
  netPaymentAmount: number;
  appliedRate: number;
}

export function calcWithholding({
  totalAmount,
  taxCategory,
  withholdingRate,
}: CalcWithholdingInput): CalcWithholdingResult {
  if (taxCategory !== "personal_withholding") {
    return {
      withholdingAmount: 0,
      netPaymentAmount: totalAmount,
      appliedRate: 0,
    };
  }

  const rate =
    typeof withholdingRate === "number" && withholdingRate >= 0
      ? withholdingRate
      : PERSONAL_WITHHOLDING_RATE;
  const withholdingAmount = Math.round(totalAmount * rate);

  return {
    withholdingAmount,
    netPaymentAmount: totalAmount - withholdingAmount,
    appliedRate: rate,
  };
}

export function isTaxInvoiceRequired(taxCategory: VendorTaxCategory | null) {
  return taxCategory === "business_vat" || taxCategory === "corporate_vat";
}

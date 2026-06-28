import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { logInfo } from "@/lib/logger";
import { calcWithholding } from "@/lib/expenses/tax";
import type { VendorTaxCategory } from "@/lib/types";

const VALID_TAX_CATEGORIES: readonly VendorTaxCategory[] = [
  "personal_withholding",
  "business_vat",
  "corporate_vat",
  "none",
];

function parseTaxCategory(value: unknown): VendorTaxCategory | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  if ((VALID_TAX_CATEGORIES as readonly string[]).includes(text)) {
    return text as VendorTaxCategory;
  }
  throw new Error(`tax_category must be one of ${VALID_TAX_CATEGORIES.join(", ")}`);
}

function parseRate(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${fieldName} must be a number`);
  }
  return parsed;
}

function parseInteger(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return parsed;
}

function parseBoolean(value: unknown, defaultValue = false): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;

  const normalized = String(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;

  return defaultValue;
}

function parseDate(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} must be YYYY-MM-DD`);
  }

  return text;
}

export async function GET(request: NextRequest) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    const typeId = url.searchParams.get("type_id");

    let query = supabase
      .from("expenses")
      .select(
        "*, expense_types(id, name), projects(id, project_number, name)"
      )
      .order("purchase_date", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (typeId) query = query.eq("type_id", typeId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const totalAmount = parseInteger(body.total_amount, "total_amount");
    if (totalAmount === null) {
      return NextResponse.json(
        { error: "total_amount is required" },
        { status: 400 }
      );
    }

    let supplyAmount = parseInteger(body.supply_amount, "supply_amount");
    let vatAmount = parseInteger(body.vat_amount, "vat_amount");

    if (supplyAmount === null && vatAmount === null) {
      supplyAmount = Math.round(totalAmount / 1.1);
      vatAmount = totalAmount - supplyAmount;
    } else if (supplyAmount === null && vatAmount !== null) {
      supplyAmount = totalAmount - vatAmount;
    } else if (supplyAmount !== null && vatAmount === null) {
      vatAmount = totalAmount - supplyAmount;
    }

    if (supplyAmount === null || vatAmount === null) {
      return NextResponse.json(
        { error: "supply_amount / vat_amount is required" },
        { status: 400 }
      );
    }

    if (supplyAmount + vatAmount !== totalAmount) {
      return NextResponse.json(
        { error: "supply_amount + vat_amount must equal total_amount" },
        { status: 400 }
      );
    }

    const vatIncluded = parseBoolean(body.vat_included, true);

    const projectId =
      body.project_id === undefined || body.project_id === null || body.project_id === ""
        ? null
        : String(body.project_id);
    const typeId =
      body.type_id === undefined || body.type_id === null || body.type_id === ""
        ? null
        : String(body.type_id);

    const vendorName =
      body.vendor_name === undefined || body.vendor_name === null || body.vendor_name === ""
        ? null
        : String(body.vendor_name).trim();

    const vendorId =
      body.vendor_id === undefined || body.vendor_id === null || body.vendor_id === ""
        ? null
        : String(body.vendor_id);

    const taxCategory = parseTaxCategory(body.tax_category);
    const withholdingRate = parseRate(body.withholding_rate, "withholding_rate");

    const purchaseDate = parseDate(body.purchase_date ?? body.expense_date, "purchase_date");
    const paymentDate = parseDate(body.payment_date ?? body.paid_date, "payment_date");
    const purchaseTaxInvoiceReceived = parseBoolean(body.purchase_tax_invoice_received, false);
    const purchaseTaxInvoiceNotRequired = parseBoolean(body.purchase_tax_invoice_not_required, false);
    const purchaseTaxInvoiceDate = parseDate(body.purchase_tax_invoice_date, "purchase_tax_invoice_date");
    const memo = body.memo === undefined || body.memo === null ? null : String(body.memo);

    if (!purchaseTaxInvoiceNotRequired && purchaseTaxInvoiceReceived && !purchaseTaxInvoiceDate) {
      return NextResponse.json(
        { error: "purchase_tax_invoice_date is required when purchase_tax_invoice_received=true" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    if (projectId) {
      const { data: projectExists, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .maybeSingle();

      if (projectError) {
        return NextResponse.json({ error: projectError.message }, { status: 400 });
      }

      if (!projectExists) {
        return NextResponse.json(
          { error: "project_id does not exist" },
          { status: 400 }
        );
      }
    }

    if (typeId) {
      const { data: typeExists, error: typeError } = await supabase
        .from("expense_types")
        .select("id")
        .eq("id", typeId)
        .maybeSingle();

      if (typeError) {
        return NextResponse.json({ error: typeError.message }, { status: 400 });
      }

      if (!typeExists) {
        return NextResponse.json(
          { error: "type_id does not exist" },
          { status: 400 }
        );
      }
    }

    let resolvedTaxCategory = taxCategory;
    let resolvedWithholdingRate = withholdingRate;
    let resolvedVendorName = vendorName;

    if (vendorId) {
      const { data: vendorRow, error: vendorError } = await supabase
        .from("customers")
        .select("id, name, tax_category, default_withholding_rate")
        .eq("id", vendorId)
        .maybeSingle();

      if (vendorError) {
        return NextResponse.json({ error: vendorError.message }, { status: 400 });
      }
      if (!vendorRow) {
        return NextResponse.json(
          { error: "vendor_id does not exist" },
          { status: 400 }
        );
      }

      if (!resolvedTaxCategory && vendorRow.tax_category) {
        resolvedTaxCategory = vendorRow.tax_category as VendorTaxCategory;
      }
      if (resolvedWithholdingRate === null && vendorRow.default_withholding_rate !== null) {
        resolvedWithholdingRate = Number(vendorRow.default_withholding_rate);
      }
      if (!resolvedVendorName) {
        resolvedVendorName = vendorRow.name;
      }
    }

    const { withholdingAmount } = calcWithholding({
      totalAmount,
      taxCategory: resolvedTaxCategory,
      withholdingRate: resolvedWithholdingRate,
    });

    const payload = {
      project_id: projectId,
      type_id: typeId,
      title,
      vendor_name: resolvedVendorName,
      vendor_id: vendorId,
      tax_category: resolvedTaxCategory,
      withholding_rate: resolvedWithholdingRate,
      withholding_amount: withholdingAmount,
      total_amount: totalAmount,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      vat_included: vatIncluded,
      purchase_date: purchaseDate,
      payment_date: paymentDate,
      status: paymentDate ? "paid" : "draft",
      purchase_tax_invoice_received: purchaseTaxInvoiceNotRequired ? false : purchaseTaxInvoiceReceived,
      purchase_tax_invoice_date:
        !purchaseTaxInvoiceNotRequired && purchaseTaxInvoiceReceived ? purchaseTaxInvoiceDate : null,
      purchase_tax_invoice_not_required: purchaseTaxInvoiceNotRequired,
      memo,
    };

    const { data, error } = await supabase
      .from("expenses")
      .insert(payload)
      .select("*, expense_types(id, name), projects(id, project_number, name)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("CREATE_EXPENSE", `매입 등록: ${title}`, {
      resource: "expense",
      resource_id: data.id,
      details: { total_amount: totalAmount, vendor_name: vendorName },
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

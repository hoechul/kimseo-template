import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { logInfo } from "@/lib/logger";

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

    const projectId =
      body.project_id === undefined || body.project_id === null || body.project_id === ""
        ? null
        : String(body.project_id);

    const revenueDate = parseDate(body.revenue_date, "revenue_date");
    const expectedPaymentDate = parseDate(body.expected_payment_date, "expected_payment_date");
    const isPaid = parseBoolean(body.is_paid, false);
    const paidDate = parseDate(body.paid_date, "paid_date");
    const isRefundRevenue = totalAmount < 0;
    const isTaxInvoiceIssued = isRefundRevenue
      ? false
      : parseBoolean(body.is_tax_invoice_issued, false);
    const taxInvoiceNotRequired = isRefundRevenue
      ? true
      : parseBoolean(body.tax_invoice_not_required, false);
    const taxInvoiceDate = parseDate(body.tax_invoice_date, "tax_invoice_date");
    const memo = body.memo === undefined || body.memo === null ? null : String(body.memo);

    const validChannels = ["아임웹", "자사몰", "기타"];
    const channel =
      body.channel && validChannels.includes(String(body.channel))
        ? String(body.channel)
        : null;
    const productName =
      channel && body.product_name ? String(body.product_name).trim() || null : null;
    const externalOrderId =
      channel && body.external_order_id ? String(body.external_order_id).trim() || null : null;

    if (isPaid && !paidDate) {
      return NextResponse.json(
        { error: "paid_date is required when is_paid=true" },
        { status: 400 }
      );
    }

    if (isTaxInvoiceIssued && !taxInvoiceDate) {
      return NextResponse.json(
        { error: "tax_invoice_date is required when is_tax_invoice_issued=true" },
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

    const payload = {
      project_id: projectId,
      channel,
      product_name: productName,
      external_order_id: externalOrderId,
      title,
      total_amount: totalAmount,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      revenue_date: revenueDate,
      expected_payment_date: expectedPaymentDate,
      is_paid: isPaid,
      paid_date: isPaid ? paidDate : null,
      is_tax_invoice_issued: isTaxInvoiceIssued,
      tax_invoice_not_required: taxInvoiceNotRequired,
      tax_invoice_date: isTaxInvoiceIssued ? taxInvoiceDate : null,
      memo,
    };

    const { data, error } = await supabase
      .from("revenues")
      .insert(payload)
      .select("id, project_id, channel, product_name, external_order_id, title, total_amount, supply_amount, vat_amount, revenue_date, expected_payment_date, is_paid, paid_date, is_tax_invoice_issued, tax_invoice_date, memo, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("CREATE_REVENUE", `매출 등록: ${title}`, { resource: "revenue", resource_id: data.id, details: { total_amount: totalAmount } });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

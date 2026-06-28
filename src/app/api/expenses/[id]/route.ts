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

function parseDate(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} must be YYYY-MM-DD`);
  }

  return text;
}

function parseInteger(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return parsed;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  return false;
}

type RouteContext = { params: Promise<{ id: string }> };

const SELECT_COLUMNS =
  "*, expense_types(id, name), projects(id, project_number, name)";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("expenses")
      .select(SELECT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const supabase = createAdminClient();

    const update: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
      }
      update.title = title;
    }

    if (body.vendor_name !== undefined) {
      update.vendor_name =
        body.vendor_name === null || body.vendor_name === ""
          ? null
          : String(body.vendor_name).trim();
    }

    if (body.total_amount !== undefined) {
      const total = parseInteger(body.total_amount, "total_amount");
      if (total === null) {
        return NextResponse.json({ error: "total_amount must be an integer" }, { status: 400 });
      }
      update.total_amount = total;
    }

    if (body.supply_amount !== undefined) {
      const supply = parseInteger(body.supply_amount, "supply_amount");
      if (supply === null) {
        return NextResponse.json({ error: "supply_amount must be an integer" }, { status: 400 });
      }
      update.supply_amount = supply;
    }

    if (body.vat_amount !== undefined) {
      const vat = parseInteger(body.vat_amount, "vat_amount");
      if (vat === null) {
        return NextResponse.json({ error: "vat_amount must be an integer" }, { status: 400 });
      }
      update.vat_amount = vat;
    }

    if (body.vat_included !== undefined) {
      update.vat_included = parseBoolean(body.vat_included);
    }

    if (body.purchase_date !== undefined || body.expense_date !== undefined) {
      const raw = body.purchase_date ?? body.expense_date;
      update.purchase_date =
        raw === null || raw === "" ? null : parseDate(raw, "purchase_date");
    }

    if (body.payment_date !== undefined || body.paid_date !== undefined) {
      const raw = body.payment_date ?? body.paid_date;
      update.payment_date =
        raw === null || raw === "" ? null : parseDate(raw, "payment_date");
    }

    if (body.purchase_tax_invoice_received !== undefined) {
      update.purchase_tax_invoice_received = parseBoolean(body.purchase_tax_invoice_received);
    }

    if (body.purchase_tax_invoice_date !== undefined) {
      update.purchase_tax_invoice_date =
        body.purchase_tax_invoice_date === null || body.purchase_tax_invoice_date === ""
          ? null
          : parseDate(body.purchase_tax_invoice_date, "purchase_tax_invoice_date");
    }

    if (body.purchase_tax_invoice_not_required !== undefined) {
      update.purchase_tax_invoice_not_required = parseBoolean(body.purchase_tax_invoice_not_required);
    }

    if (body.memo !== undefined) {
      update.memo =
        body.memo === null || body.memo === "" ? null : String(body.memo);
    }

    if (body.project_id !== undefined) {
      const projectId =
        body.project_id === null || body.project_id === ""
          ? null
          : String(body.project_id);

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

      update.project_id = projectId;
    }

    if (body.type_id !== undefined) {
      const typeId =
        body.type_id === null || body.type_id === ""
          ? null
          : String(body.type_id);

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

      update.type_id = typeId;
    }

    if (body.vendor_id !== undefined) {
      const vendorId =
        body.vendor_id === null || body.vendor_id === ""
          ? null
          : String(body.vendor_id);

      if (vendorId) {
        const { data: vendorExists, error: vendorError } = await supabase
          .from("customers")
          .select("id")
          .eq("id", vendorId)
          .maybeSingle();
        if (vendorError) {
          return NextResponse.json({ error: vendorError.message }, { status: 400 });
        }
        if (!vendorExists) {
          return NextResponse.json(
            { error: "vendor_id does not exist" },
            { status: 400 }
          );
        }
      }
      update.vendor_id = vendorId;
    }

    if (body.tax_category !== undefined) {
      if (body.tax_category === null || body.tax_category === "") {
        update.tax_category = null;
      } else {
        const tc = String(body.tax_category).trim();
        if (!(VALID_TAX_CATEGORIES as readonly string[]).includes(tc)) {
          return NextResponse.json(
            { error: `tax_category must be one of ${VALID_TAX_CATEGORIES.join(", ")}` },
            { status: 400 }
          );
        }
        update.tax_category = tc;
      }
    }

    if (body.withholding_rate !== undefined) {
      if (body.withholding_rate === null || body.withholding_rate === "") {
        update.withholding_rate = null;
      } else {
        const rate = Number.parseFloat(String(body.withholding_rate));
        if (!Number.isFinite(rate) || Number.isNaN(rate)) {
          return NextResponse.json(
            { error: "withholding_rate must be a number" },
            { status: 400 }
          );
        }
        update.withholding_rate = rate;
      }
    }

    // 세금 관련 필드 변경 시 withholding_amount 재계산
    if (
      update.tax_category !== undefined ||
      update.withholding_rate !== undefined ||
      update.total_amount !== undefined
    ) {
      const { data: current } = await supabase
        .from("expenses")
        .select("total_amount, tax_category, withholding_rate")
        .eq("id", id)
        .maybeSingle();
      const totalForCalc = (update.total_amount as number | undefined) ?? current?.total_amount ?? 0;
      const categoryForCalc =
        (update.tax_category as VendorTaxCategory | null | undefined) ??
        (current?.tax_category as VendorTaxCategory | null | undefined) ??
        null;
      const rateForCalc =
        (update.withholding_rate as number | null | undefined) ??
        (current?.withholding_rate !== null && current?.withholding_rate !== undefined
          ? Number(current.withholding_rate)
          : null);
      const { withholdingAmount } = calcWithholding({
        totalAmount: totalForCalc,
        taxCategory: categoryForCalc ?? null,
        withholdingRate: rateForCalc,
      });
      update.withholding_amount = withholdingAmount;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("expenses")
      .update(update)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    logInfo("UPDATE_EXPENSE", `매입 수정: ${data.title} ${data.total_amount}원`, {
      resource: "expense",
      resource_id: data.id,
      details: update,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("expenses")
      .select("id, title, total_amount")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("DELETE_EXPENSE", `매입 삭제: ${existing.title} ${existing.total_amount}원`, {
      resource: "expense",
      resource_id: existing.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

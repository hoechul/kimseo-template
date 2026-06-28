import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { logInfo } from "@/lib/logger";

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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("deposits")
      .select("*, revenues(id, title, total_amount)")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
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

    // Build update payload from provided fields only
    const update: Record<string, unknown> = {};

    if (body.deposit_date !== undefined) {
      const depositDate = parseDate(body.deposit_date, "deposit_date");
      if (!depositDate) {
        return NextResponse.json(
          { error: "deposit_date must be YYYY-MM-DD" },
          { status: 400 }
        );
      }
      update.deposit_date = depositDate;
    }

    if (body.amount !== undefined) {
      const amount = parseInteger(body.amount, "amount");
      if (amount === null || amount <= 0) {
        return NextResponse.json(
          { error: "amount must be an integer > 0" },
          { status: 400 }
        );
      }
      update.amount = amount;
    }

    if (body.depositor_name !== undefined) {
      const depositorName =
        typeof body.depositor_name === "string" ? body.depositor_name.trim() : "";
      if (!depositorName) {
        return NextResponse.json(
          { error: "depositor_name cannot be empty" },
          { status: 400 }
        );
      }
      update.depositor_name = depositorName;
    }

    if (body.bank_name !== undefined) {
      update.bank_name =
        body.bank_name === null || body.bank_name === ""
          ? null
          : String(body.bank_name).trim();
    }

    if (body.account_alias !== undefined) {
      update.account_alias =
        body.account_alias === null || body.account_alias === ""
          ? null
          : String(body.account_alias).trim();
    }

    if (body.revenue_id !== undefined) {
      const revenueId =
        body.revenue_id === null || body.revenue_id === ""
          ? null
          : String(body.revenue_id);

      if (revenueId) {
        const { data: revenueExists, error: revenueError } = await supabase
          .from("revenues")
          .select("id")
          .eq("id", revenueId)
          .maybeSingle();

        if (revenueError) {
          return NextResponse.json({ error: revenueError.message }, { status: 400 });
        }

        if (!revenueExists) {
          return NextResponse.json(
            { error: "revenue_id does not exist" },
            { status: 400 }
          );
        }
      }

      update.revenue_id = revenueId;
    }

    if (body.raw_message !== undefined) {
      update.raw_message =
        body.raw_message === null || body.raw_message === ""
          ? null
          : String(body.raw_message);
    }

    if (body.memo !== undefined) {
      update.memo =
        body.memo === null || body.memo === ""
          ? null
          : String(body.memo);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("deposits")
      .update(update)
      .eq("id", id)
      .select("*, revenues(id, title, total_amount)")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    logInfo("UPDATE_DEPOSIT", `입금 수정: ${data.depositor_name} ${data.amount}원`, {
      resource: "deposit",
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

    // Fetch before delete for logging
    const { data: existing } = await supabase
      .from("deposits")
      .select("id, depositor_name, amount")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("deposits")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("DELETE_DEPOSIT", `입금 삭제: ${existing.depositor_name} ${existing.amount}원`, {
      resource: "deposit",
      resource_id: existing.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { logInfo, logError } from "@/lib/logger";
import { sendDepositSlackNotification } from "@/lib/slack";

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

export async function GET(request: NextRequest) {
  try {
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("deposits")
      .select("*, revenues(id, title, total_amount)")
      .order("deposit_date", { ascending: false });

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

    // Required: deposit_date
    const depositDate = parseDate(body.deposit_date, "deposit_date");
    if (!depositDate) {
      return NextResponse.json(
        { error: "deposit_date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Required: amount
    const amount = parseInteger(body.amount, "amount");
    if (amount === null || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be an integer > 0" },
        { status: 400 }
      );
    }

    // Required: depositor_name
    const depositorName =
      typeof body.depositor_name === "string" ? body.depositor_name.trim() : "";
    if (!depositorName) {
      return NextResponse.json(
        { error: "depositor_name is required" },
        { status: 400 }
      );
    }

    // Optional fields
    const bankName =
      body.bank_name === undefined || body.bank_name === null || body.bank_name === ""
        ? null
        : String(body.bank_name).trim();
    const accountAlias =
      body.account_alias === undefined || body.account_alias === null || body.account_alias === ""
        ? null
        : String(body.account_alias).trim();
    const revenueId =
      body.revenue_id === undefined || body.revenue_id === null || body.revenue_id === ""
        ? null
        : String(body.revenue_id);
    const rawMessage =
      body.raw_message === undefined || body.raw_message === null || body.raw_message === ""
        ? null
        : String(body.raw_message);
    const memo =
      body.memo === undefined || body.memo === null || body.memo === ""
        ? null
        : String(body.memo);

    const supabase = createAdminClient();

    // Validate revenue_id if provided
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

    const payload = {
      deposit_date: depositDate,
      amount,
      depositor_name: depositorName,
      bank_name: bankName,
      account_alias: accountAlias,
      revenue_id: revenueId,
      source: "manual" as const,
      raw_message: rawMessage,
      memo,
    };

    const { data, error } = await supabase
      .from("deposits")
      .insert(payload)
      .select("id, deposit_date, amount, depositor_name, bank_name, account_alias, revenue_id, source, raw_message, memo, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logInfo("CREATE_DEPOSIT", `입금 등록: ${depositorName} ${amount}원`, {
      resource: "deposit",
      resource_id: data.id,
      details: { amount, depositor_name: depositorName, source: "manual" },
    });

    sendDepositSlackNotification({ depositorName, amount }).catch((err) => {
      logError(
        "DEPOSIT_SLACK_NOTIFY",
        err instanceof Error ? err.message : "Slack 입금 알림 발송 실패",
        { resource: "deposit", resource_id: data.id }
      );
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

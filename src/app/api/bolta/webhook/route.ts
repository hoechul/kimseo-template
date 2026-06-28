import { timingSafeEqual } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { getBoltaTaxInvoice, getBoltaWebhookSecret } from "@/lib/bolta";
import { logError, logInfo } from "@/lib/logger";
import { sendTaxInvoiceIssuedSlackNotification } from "@/lib/slack";
import { createAdminClient } from "@/lib/supabase/admin";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

type BoltaWebhookPayload = {
  eventType?: string;
  data?: {
    issuanceKey?: string;
    taxInvoiceUrl?: string;
    cause?: {
      code?: string;
      message?: string;
    };
  };
};

function getWebhookSecret(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get("secret") ??
    request.headers.get("x-bolta-webhook-secret")
  );
}

export async function POST(request: NextRequest) {
  const configuredSecret = await getBoltaWebhookSecret();
  if (!configuredSecret) {
    return NextResponse.json(
      { error: "Bolta webhook secret is not configured" },
      { status: 503 }
    );
  }

  const incomingSecret = getWebhookSecret(request);
  if (!incomingSecret || !safeCompare(incomingSecret, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as BoltaWebhookPayload;
  const eventType = payload.eventType ?? "";
  const issuanceKey = payload.data?.issuanceKey?.trim();

  if (!issuanceKey) {
    return NextResponse.json(
      { error: "issuanceKey is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: revenue, error: revenueError } = await admin
    .from("revenues")
    .select("id, title, tax_invoice_issuance_key")
    .eq("tax_invoice_issuance_key", issuanceKey)
    .maybeSingle();

  if (revenueError) {
    logError("ERROR_BOLTA_WEBHOOK_LOOKUP", "Bolta 웹훅 매출 조회 실패", {
      details: {
        issuance_key: issuanceKey,
        message: revenueError.message,
      },
    });

    return NextResponse.json({ error: revenueError.message }, { status: 400 });
  }

  if (!revenue) {
    logError("MISSING_BOLTA_WEBHOOK_REVENUE", "Bolta 웹훅 매출을 찾지 못했습니다.", {
      details: {
        issuance_key: issuanceKey,
        event_type: eventType,
      },
    });

    return NextResponse.json(
      { error: "Revenue not found for issuanceKey" },
      { status: 404 }
    );
  }

  const sharedPayload = {
    tax_invoice_last_webhook_at: now,
    tax_invoice_last_payload: payload,
  };

  if (eventType === "TAX_INVOICE_ISSUANCE_SUCCESS") {
    let issuedAt = now;
    let ntsTransactionId: string | null = null;

    try {
      const boltaInvoice = await getBoltaTaxInvoice(issuanceKey);
      issuedAt = boltaInvoice.issuedAt ?? issuedAt;
      ntsTransactionId = boltaInvoice.ntsTransactionId ?? null;
    } catch (error) {
      logError("ERROR_BOLTA_TAX_INVOICE_FETCH", "Bolta 세금계산서 조회 실패", {
        resource: "revenue",
        resource_id: revenue.id,
        details: {
          issuance_key: issuanceKey,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }

    const { error: updateError } = await admin
      .from("revenues")
      .update({
        ...sharedPayload,
        tax_invoice_issue_status: "issued",
        is_tax_invoice_issued: true,
        tax_invoice_date: issuedAt.slice(0, 10),
        tax_invoice_issued_at: issuedAt,
        tax_invoice_url: payload.data?.taxInvoiceUrl ?? null,
        tax_invoice_nts_transaction_id: ntsTransactionId,
        tax_invoice_error_code: null,
        tax_invoice_error_message: null,
      })
      .eq("id", revenue.id);

    if (updateError) {
      logError("ERROR_BOLTA_WEBHOOK_SUCCESS_UPDATE", "Bolta 웹훅 성공 상태 반영 실패", {
        resource: "revenue",
        resource_id: revenue.id,
        details: {
          issuance_key: issuanceKey,
          message: updateError.message,
        },
      });

      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    logInfo("COMPLETE_REVENUE_TAX_INVOICE", `세금계산서 발행 완료: ${revenue.title}`, {
      resource: "revenue",
      resource_id: revenue.id,
      details: {
        issuance_key: issuanceKey,
        tax_invoice_url: payload.data?.taxInvoiceUrl ?? null,
      },
    });

    const revenueUrl = new URL(
      `/dashboard/revenues/${revenue.id}`,
      request.nextUrl.origin
    ).toString();

    try {
      await sendTaxInvoiceIssuedSlackNotification({
        revenueId: revenue.id,
        revenueUrl,
      });
    } catch (error) {
      logError("TAX_INVOICE_SLACK_NOTIFY", "세금계산서 발행 완료 Slack 알림 실패", {
        resource: "revenue",
        resource_id: revenue.id,
        details: {
          issuance_key: issuanceKey,
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }

    return NextResponse.json({ success: true });
  }

  if (eventType === "TAX_INVOICE_ISSUANCE_FAILURE") {
    const errorCode = payload.data?.cause?.code ?? null;
    const errorMessage =
      payload.data?.cause?.message ?? "세금계산서 발행이 실패했습니다.";

    const { error: updateError } = await admin
      .from("revenues")
      .update({
        ...sharedPayload,
        tax_invoice_issue_status: "failed",
        is_tax_invoice_issued: false,
        tax_invoice_date: null,
        tax_invoice_issued_at: null,
        tax_invoice_url: null,
        tax_invoice_nts_transaction_id: null,
        tax_invoice_error_code: errorCode,
        tax_invoice_error_message: errorMessage,
      })
      .eq("id", revenue.id);

    if (updateError) {
      logError("ERROR_BOLTA_WEBHOOK_FAILURE_UPDATE", "Bolta 웹훅 실패 상태 반영 실패", {
        resource: "revenue",
        resource_id: revenue.id,
        details: {
          issuance_key: issuanceKey,
          message: updateError.message,
        },
      });

      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    logError("FAIL_REVENUE_TAX_INVOICE_WEBHOOK", `세금계산서 발행 실패: ${revenue.title}`, {
      resource: "revenue",
      resource_id: revenue.id,
      details: {
        issuance_key: issuanceKey,
        code: errorCode,
        message: errorMessage,
      },
    });

    return NextResponse.json({ success: true });
  }

  logInfo("IGNORE_BOLTA_WEBHOOK", "처리 대상이 아닌 Bolta 웹훅 이벤트를 수신했습니다.", {
    resource: "revenue",
    resource_id: revenue.id,
    details: {
      issuance_key: issuanceKey,
      event_type: eventType,
    },
  });

  await admin
    .from("revenues")
    .update(sharedPayload)
    .eq("id", revenue.id);

  return NextResponse.json({ success: true, ignored: true });
}

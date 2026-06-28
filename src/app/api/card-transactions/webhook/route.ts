import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateApiKey } from "@/lib/api-key";
import { parseCardSms } from "@/lib/card-sms-parser";
import { logInfo } from "@/lib/logger";
import {
  forwardNotificationToSlack,
  shouldForwardNotification,
} from "@/lib/notification-filter";

/**
 * 법인카드 SMS 수신 webhook.
 *
 * Tasker 등 외부에서 다음 방식 중 어느 쪽으로 보내도 동작한다.
 *
 *   1) Form-urlencoded:  Content-Type: application/x-www-form-urlencoded
 *                        Body: sender=01012345678&text=[Web발신]+NH...
 *                        (text 필드가 SMS 본문. text가 비어있으면 sender를 본문으로 시도)
 *
 *   2) JSON:             Content-Type: application/json
 *                        Body: {"text": "[Web발신]\nNH기업9174승인\n..."}
 *
 *   3) Raw text:         Content-Type: text/plain (또는 헤더 없이)
 *                        Body: [Web발신]\nNH기업9174승인\n...
 *
 * Tasker SMS Received profile의 표준 변수:
 *   - %sms_body / %evtprm2 → SMS 본문
 *   - %sender / %evtprm1   → 발신번호
 * (`%evtprm3`은 SMS Received에서 비어있으니 사용 금지)
 */
export async function POST(request: NextRequest) {
  try {
    const valid = await validateApiKey(request);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    const bodyRaw = await request.text();

    // Body에서 SMS 원문 추출
    let smsText = "";
    let sender: string | null = null;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(bodyRaw);
      smsText = params.get("text") ?? "";
      sender = params.get("sender");
      // text가 비어있고 sender만 채워졌으면 Tasker 변수 매핑이 거꾸로인 케이스 — sender를 본문으로 시도
      if (!smsText && sender) {
        smsText = sender;
        sender = null;
      }
    } else if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(bodyRaw);
        if (typeof parsed === "string") {
          smsText = parsed;
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          smsText = typeof obj.text === "string" ? obj.text : "";
          sender = typeof obj.sender === "string" ? obj.sender : null;
        }
      } catch (e) {
        // JSON 헤더인데 내용이 깨졌으면 raw로 한 번 더 시도 (Tasker가 본문 이스케이프 실패한 케이스)
        console.warn(
          "[card-webhook] JSON parse failed, falling back to raw body:",
          e instanceof Error ? e.message : String(e),
          "body=",
          bodyRaw.slice(0, 200)
        );
        smsText = bodyRaw;
      }
    } else {
      smsText = bodyRaw;
    }

    smsText = smsText.trim();
    if (!smsText) {
      return NextResponse.json({ error: "Empty body" }, { status: 400 });
    }

    const receivedAt = new Date();
    let parsed;
    try {
      parsed = parseCardSms(smsText, receivedAt);
      if (Number.isNaN(parsed.approvedAt.getTime())) {
        parsed.approvedAt = receivedAt;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "parse error";
      console.error(
        "[card-webhook] parseCardSms failed:",
        message,
        "text=",
        smsText.slice(0, 200)
      );
      return NextResponse.json({ error: `parse failed: ${message}` }, { status: 422 });
    }

    const supabase = createAdminClient();

    let cardId: string | null = null;
    if (parsed.last4) {
      const { data: cardData } = await supabase
        .from("corporate_cards")
        .select("id")
        .eq("last4", parsed.last4)
        .eq("is_active", true)
        .maybeSingle();
      cardId = cardData?.id ?? null;
    }

    const { data: inserted, error } = await supabase
      .from("card_transactions")
      .insert({
        card_id: cardId,
        card_last4: parsed.last4,
        amount: parsed.amount,
        currency: parsed.currency,
        foreign_amount: parsed.foreignAmount,
        merchant: parsed.merchant,
        approved_at: parsed.approvedAt.toISOString(),
        raw_text: smsText,
        parse_status: parsed.status,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[card-webhook] insert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const amountLabel =
      parsed.currency === "KRW"
        ? `${parsed.amount.toLocaleString()}원`
        : `${parsed.currency} ${parsed.foreignAmount ?? 0}`;
    logInfo(
      "CREATE_CARD_TRANSACTION",
      `카드거래 수신: ${parsed.merchant ?? "(가맹점 미상)"} ${amountLabel}`,
      { resource: "card_transaction", resource_id: inserted.id }
    );

    // blocklist 통과 시 Slack SMS 채널로 전달.
    // 카드 row 자체는 항상 만들되, 필터는 Slack 전달에만 영향한다.
    const filterResult = await shouldForwardNotification(smsText);
    let slackResult: Awaited<ReturnType<typeof forwardNotificationToSlack>> | null = null;
    if (filterResult.forward) {
      slackResult = await forwardNotificationToSlack(smsText);
    }

    return NextResponse.json(
      {
        success: true,
        id: inserted.id,
        parsed: {
          amount: parsed.amount,
          currency: parsed.currency,
          foreign_amount: parsed.foreignAmount,
          last4: parsed.last4,
          merchant: parsed.merchant,
          approved_at: parsed.approvedAt.toISOString(),
          issuer: parsed.issuer,
          status: parsed.status,
          card_matched: cardId !== null,
        },
        slack: filterResult.forward
          ? slackResult
          : { delivered: false, blocked_by: filterResult.matched },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[card-webhook] unhandled error:", message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

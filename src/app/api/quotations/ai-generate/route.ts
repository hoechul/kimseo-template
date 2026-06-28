import Anthropic from "@anthropic-ai/sdk";
import { toKstDateString, addDaysToDateString } from "@/lib/date";
import { logInfo } from "@/lib/logger";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const { transcript, context } = await request.json();

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return Response.json(
      { error: "전사록(transcript)을 입력해주세요." },
      { status: 400 }
    );
  }

  // Load AI prompt from system_settings
  const { data: promptSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "quotation_ai_prompt")
    .single();

  const aiPrompt =
    promptSetting?.value ||
    `당신은 소프트웨어 개발 견적서를 작성하는 전문가입니다.
미팅 전사록과 맥락 정보를 바탕으로 견적서 데이터를 JSON 형식으로 생성합니다.

규칙:
- 품목(items)은 구체적인 개발 작업 단위로 분리합니다.
- 단가는 한국소프트웨어산업협회 「2026년 소프트웨어기술자 노임단가」를 참고합니다.
- 단위는 "일" 또는 "식"을 사용합니다.
- 결제조건: 공급가액 기준 1,000만원 이하는 "착수금 50%, 잔금 50%", 1,000만원 초과는 "착수금 30%, 중도금 40%, 잔금 30%"로 작성합니다. 미팅에서 별도 합의된 조건이 있으면 그것을 우선합니다.
- 납기 등도 미팅 내용에 기반하여 작성합니다.
- 금액은 정수(원 단위)로 작성합니다.`;

  // Load model setting (quotation-specific, fallback to chat model)
  const { data: modelSetting } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "quotation_ai_model")
    .single();
  const model = modelSetting?.value ?? "claude-sonnet-4-6";

  const systemPrompt = `${aiPrompt}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "recipient_name": "수신자(회사)명",
  "recipient_contact_name": "담당자명 또는 null",
  "items": [
    {
      "item_name": "품명",
      "specification": "규격/설명 또는 null",
      "unit": "일",
      "quantity": 1,
      "unit_price": 500000,
      "remark": "비고 또는 null"
    }
  ],
  "payment_terms": "결제조건 또는 null",
  "delivery_terms": "납기 또는 null",
  "memo": "비고/특약사항 또는 null"
}`;

  const userMessage = [
    "## 미팅 전사록",
    transcript.trim(),
    context?.trim() ? `\n## 추가 맥락\n${context.trim()}` : "",
    "\n위 내용을 바탕으로 견적서 데이터를 JSON으로 생성해주세요.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    let response;
    try {
      response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
    } catch (aiError) {
      const msg = aiError instanceof Error ? aiError.message : String(aiError);
      console.error("Anthropic API error:", msg);
      return Response.json(
        { error: `AI API 호출 실패: ${msg}` },
        { status: 502 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [
      null,
      rawText,
    ];
    const jsonStr = (jsonMatch[1] || rawText).trim();

    let parsed: {
      recipient_name?: string;
      recipient_contact_name?: string | null;
      items?: {
        item_name: string;
        specification?: string | null;
        unit?: string;
        quantity?: number;
        unit_price?: number;
        remark?: string | null;
      }[];
      payment_terms?: string | null;
      delivery_terms?: string | null;
      memo?: string | null;
    };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return Response.json(
        { error: "AI 응답을 파싱할 수 없습니다.", raw: rawText },
        { status: 422 }
      );
    }

    // --- DB에 견적 저장 ---
    const { data: quotationNumber, error: rpcError } = await supabase.rpc(
      "generate_quotation_number"
    );
    if (rpcError || !quotationNumber) {
      return Response.json(
        { error: "견적번호 생성 실패: " + (rpcError?.message ?? "") },
        { status: 500 }
      );
    }

    const items = (parsed.items ?? []).map((item, idx) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unit_price) || 0;
      return {
        sort_order: idx,
        item_name: String(item.item_name || ""),
        specification: item.specification || null,
        unit: item.unit || "일",
        quantity: qty,
        unit_price: price,
        supply_amount: qty * price,
        remark: item.remark || null,
      };
    });

    const supplyTotal = items.reduce((s, i) => s + i.supply_amount, 0);
    const vatTotal = Math.round(supplyTotal * 0.1);
    const today = toKstDateString();

    const payload = {
      quotation_number: quotationNumber as string,
      quotation_date: today,
      valid_until: addDaysToDateString(today, 30),
      status: "작성중" as const,
      customer_id: null,
      recipient_name: parsed.recipient_name || "미지정",
      recipient_contact_name: parsed.recipient_contact_name || null,
      recipient_phone: null,
      recipient_address: null,
      supplier_name: "",
      supplier_representative: "",
      supplier_business_number: "",
      supplier_phone: "",
      supplier_manager: "",
      supplier_address: null,
      supplier_business_type: null,
      supplier_business_category: null,
      supply_total: supplyTotal,
      vat_total: vatTotal,
      grand_total: supplyTotal + vatTotal,
      payment_terms: parsed.payment_terms || null,
      delivery_terms: parsed.delivery_terms || null,
      bank_account: "",
      memo: parsed.memo || null,
      project_id: null,
      version: 1,
      parent_id: null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("quotations")
      .insert(payload)
      .select("id, quotation_number")
      .single();

    if (insertError) {
      return Response.json(
        { error: "견적 저장 실패: " + insertError.message },
        { status: 500 }
      );
    }

    if (items.length > 0) {
      const itemsPayload = items.map((item) => ({
        ...item,
        quotation_id: inserted.id,
      }));
      const { error: itemsError } = await supabase
        .from("quotation_items")
        .insert(itemsPayload);
      if (itemsError) {
        return Response.json(
          { error: "품목 저장 실패: " + itemsError.message },
          { status: 500 }
        );
      }
    }

    logInfo("CREATE_QUOTATION", `AI 견적 생성: ${inserted.quotation_number}`, {
      resource: "quotation",
      resource_id: inserted.id,
    });

    return Response.json({
      success: true,
      data: {
        id: inserted.id,
        quotation_number: inserted.quotation_number,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Quotation AI generate error:", msg, error);
    return Response.json(
      { error: `AI 견적 생성 실패: ${msg}` },
      { status: 500 }
    );
  }
}

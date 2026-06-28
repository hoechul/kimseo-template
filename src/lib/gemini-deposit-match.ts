import { calcGeminiCost } from "@/lib/gemini-models";
import { getGeminiApiKey } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";

const MODEL = "gemini-2.5-flash-lite";

export interface DepositMatchSuggestion {
  revenue_id: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface RevenueCandidate {
  id: string;
  title: string;
  total_amount: number;
  supply_amount: number;
  project_name: string | null;
  client: string | null;
  expected_payment_date: string | null;
}

// 법인격·공백·특수문자를 제거하여 이름을 비교용 키로 만든다.
// "주식회사 바른", "(주)바른", "㈜바른", "바른 주식회사" → "바른"
export function normalizeBusinessName(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .normalize("NFKC")
    .replace(/[㈜㈔]/g, "")
    .replace(/\(\s*주\s*\)/g, "")
    .replace(/\(\s*유\s*\)/g, "")
    .replace(/\(\s*재\s*\)/g, "")
    .replace(/\(\s*사\s*\)/g, "")
    .replace(/주식\s*회사/g, "")
    .replace(/유한\s*회사/g, "")
    .replace(/재단\s*법인/g, "")
    .replace(/사단\s*법인/g, "")
    .replace(/유한\s*책임\s*회사/g, "")
    .replace(/[\s\-_.·・()[\]{}'"&]/g, "")
    .toLowerCase()
    .trim();
}

export async function suggestDepositRevenueMatch(params: {
  deposit: {
    depositor_name: string;
    amount: number;
    deposit_date: string;
    memo: string | null;
  };
  revenues: RevenueCandidate[];
}): Promise<DepositMatchSuggestion[]> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key가 설정되지 않았습니다.");
  }

  if (params.revenues.length === 0) {
    return [];
  }

  const revenueList = params.revenues
    .map((r) => {
      const parts = [
        `id: ${r.id}`,
        `제목: ${r.title}`,
        `금액: ${r.total_amount.toLocaleString()}원`,
        `공급가: ${r.supply_amount.toLocaleString()}원`,
      ];
      if (r.project_name) parts.push(`프로젝트: ${r.project_name}`);
      if (r.client) parts.push(`거래처: ${r.client}`);
      if (r.expected_payment_date) parts.push(`예정일: ${r.expected_payment_date}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");

  const depositInfo = [
    `입금자명: ${params.deposit.depositor_name}`,
    `입금액: ${params.deposit.amount.toLocaleString()}원`,
    `입금일: ${params.deposit.deposit_date}`,
    params.deposit.memo ? `메모: ${params.deposit.memo}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `당신은 입금과 매출을 매칭하는 전문가입니다.

## 입금 정보
${depositInfo}

## 미결제 매출 목록
${revenueList}

## 매칭 규칙
1. 입금자명과 매출의 제목/프로젝트명/거래처명의 유사도를 확인합니다.
2. 입금액과 매출 금액(total_amount) 또는 공급가(supply_amount)가 일치하는지 확인합니다.
3. 입금일과 예정결제일의 근접도를 고려합니다.
4. 확실한 매칭만 high, 가능성 있는 매칭은 medium, 약한 매칭은 low로 표시합니다.
5. 매칭 근거가 없으면 포함하지 마세요.
6. 최대 5개까지만 추천합니다.
7. reason은 한국어로 간결하게 작성합니다.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    revenue_id: { type: "string" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    reason: { type: "string" },
                  },
                  required: ["revenue_id", "confidence", "reason"],
                },
              },
            },
            required: ["suggestions"],
          },
          temperature: 0.1,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Gemini API 요청 실패");
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!text) return [];

  // 비용 로깅
  const promptTokens = Number(payload?.usageMetadata?.promptTokenCount ?? 0);
  const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount ?? 0);
  const { inputCost, outputCost, totalCost } = calcGeminiCost(MODEL, promptTokens, outputTokens);

  try {
    await createAdminClient().from("gemini_usage_logs").insert({
      user_auth_uid: null,
      feature: "deposit_revenue_match",
      model: MODEL,
      input_tokens: promptTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: totalCost,
      image_count: 0,
      request_summary: `입금 매칭: ${params.deposit.depositor_name} ${params.deposit.amount.toLocaleString()}원`,
    });
  } catch {
    // ignore logging failures
  }

  try {
    const parsed = JSON.parse(text);
    const suggestions: DepositMatchSuggestion[] = parsed.suggestions ?? [];

    // 유효한 revenue_id만 필터링
    const validIds = new Set(params.revenues.map((r) => r.id));
    return suggestions.filter((s) => validIds.has(s.revenue_id));
  } catch {
    return [];
  }
}

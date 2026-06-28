import { createClient } from "@/lib/supabase/server";
import { DEFAULT_GEMINI_OCR_MODEL, calcGeminiCost } from "@/lib/gemini-models";
import { formatKoreanPhoneNumber } from "@/lib/phone";
import { getSystemSettingWithEnvFallback } from "@/lib/system-settings";

export interface BusinessCardOcrResult {
  name: string;
  company_name: string;
  position: string;
  email: string;
  phone: string;
  address: string;
  raw_text: string;
}

export interface BusinessCardOcrUsage {
  input_tokens: number;
  output_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
}

export interface BusinessCardOcrResponse extends BusinessCardOcrResult {
  model: string;
  usage: BusinessCardOcrUsage;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export async function getGeminiApiKey() {
  return getSystemSettingWithEnvFallback("gemini_api_key", "GEMINI_API_KEY");
}

export async function getGeminiOcrModel() {
  return (
    (await getSystemSettingWithEnvFallback(
      "business_card_ocr_model",
      "GEMINI_OCR_MODEL"
    )) ?? DEFAULT_GEMINI_OCR_MODEL
  );
}

export async function extractBusinessCardWithGemini(params: {
  userAuthUid: string;
  mimeType: string;
  base64Data: string;
}): Promise<BusinessCardOcrResponse> {
  const apiKey = await getGeminiApiKey();
  const model = await getGeminiOcrModel();

  if (!apiKey) {
    throw new Error("Gemini API Key가 설정되지 않았습니다.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "You are extracting fields from a Korean business card image.",
                  "Return valid JSON only.",
                  'Use this exact schema: {"name":"","company_name":"","position":"","email":"","phone":"","address":"","raw_text":""}',
                  "If a field is missing, return an empty string.",
                  "Do not guess unavailable values.",
                  "raw_text should contain a compact OCR transcription of the visible text.",
                ].join("\n"),
              },
              {
                inline_data: {
                  mime_type: params.mimeType,
                  data: params.base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              company_name: { type: "string" },
              position: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              address: { type: "string" },
              raw_text: { type: "string" },
            },
            required: [
              "name",
              "company_name",
              "position",
              "email",
              "phone",
              "address",
              "raw_text",
            ],
          },
          temperature: 0.1,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      "Gemini OCR 요청에 실패했습니다.";
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini OCR 결과가 비어 있습니다.");
  }

  const parsed = JSON.parse(stripCodeFence(text));

  const promptTokens = Number(payload?.usageMetadata?.promptTokenCount ?? 0);
  const outputTokens = Number(payload?.usageMetadata?.candidatesTokenCount ?? 0);
  const { inputCost, outputCost, totalCost } = calcGeminiCost(
    model,
    promptTokens,
    outputTokens
  );

  try {
    const supabase = await createClient();
    await supabase.from("gemini_usage_logs").insert({
      user_auth_uid: params.userAuthUid,
      feature: "business_card_ocr",
      model,
      input_tokens: promptTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: totalCost,
      image_count: 1,
      request_summary: "business_card_ocr",
    });
  } catch {
    // ignore logging failures
  }

  return {
    model,
    name: normalizeString(parsed?.name),
    company_name: normalizeString(parsed?.company_name),
    position: normalizeString(parsed?.position),
    email: normalizeString(parsed?.email),
    phone: formatKoreanPhoneNumber(normalizeString(parsed?.phone)),
    address: normalizeString(parsed?.address),
    raw_text: normalizeString(parsed?.raw_text),
    usage: {
      input_tokens: promptTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: totalCost,
    },
  };
}

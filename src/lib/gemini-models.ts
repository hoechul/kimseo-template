export interface GeminiModelOption {
  id: string;
  display_name: string;
  tier: string;
  context: string;
  max_output: string;
  input_price: number;
  output_price: number;
  description: string;
  stable: boolean;
}

export const GEMINI_MODEL_OPTIONS: GeminiModelOption[] = [
  {
    id: "gemini-2.5-flash-lite",
    display_name: "Gemini 2.5 Flash-Lite",
    tier: "2.5 Flash-Lite",
    context: "1M",
    max_output: "64K",
    input_price: 0.1,
    output_price: 0.4,
    description: "가장 저렴한 멀티모달 모델",
    stable: true,
  },
  {
    id: "gemini-2.5-flash",
    display_name: "Gemini 2.5 Flash",
    tier: "2.5 Flash",
    context: "1M",
    max_output: "64K",
    input_price: 0.3,
    output_price: 2.5,
    description: "품질과 속도의 균형이 좋은 기본 OCR 후보",
    stable: true,
  },
  {
    id: "gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    tier: "2.5 Pro",
    context: "1M",
    max_output: "64K",
    input_price: 1.25,
    output_price: 10,
    description: "복잡한 해석 품질이 높지만 비용이 큼",
    stable: true,
  },
  {
    id: "gemini-3-flash-preview",
    display_name: "Gemini 3 Flash Preview",
    tier: "3 Flash Preview",
    context: "1M",
    max_output: "64K",
    input_price: 0.5,
    output_price: 3,
    description: "가장 최신 계열이지만 프리뷰 모델",
    stable: false,
  },
];

export const DEFAULT_GEMINI_OCR_MODEL = "gemini-2.5-flash-lite";

export function getGeminiModelOption(model: string) {
  return (
    GEMINI_MODEL_OPTIONS.find((option) => option.id === model) ??
    GEMINI_MODEL_OPTIONS.find((option) => option.id === DEFAULT_GEMINI_OCR_MODEL)!
  );
}

export function calcGeminiCost(
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const pricing = getGeminiModelOption(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input_price;
  const outputCost = (outputTokens / 1_000_000) * pricing.output_price;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

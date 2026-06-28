import Anthropic from "@anthropic-ai/sdk";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Static metadata — Anthropic API doesn't expose pricing/context info
// Source: https://docs.anthropic.com/en/docs/about-claude/models
const MODEL_META: Record<string, { tier: string; context: string; maxOutput: string; inputPrice: number; outputPrice: number; description: string }> = {
  "claude-opus-4-6":          { tier: "Opus 4.6",   context: "200K", maxOutput: "128K", inputPrice: 5,  outputPrice: 25, description: "최고 지능, 에이전트·코딩 특화" },
  "claude-sonnet-4-6":        { tier: "Sonnet 4.6", context: "200K", maxOutput: "64K",  inputPrice: 3,  outputPrice: 15, description: "속도와 지능의 최적 균형" },
  "claude-haiku-4-5-20251001":{ tier: "Haiku 4.5",  context: "200K", maxOutput: "64K",  inputPrice: 1,  outputPrice: 5,  description: "가장 빠르고 경제적" },
};

export async function GET() {
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  // Current model settings
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", ["chat_model", "quotation_ai_model"]);

  const currentModel = settings?.find((s) => s.key === "chat_model")?.value ?? "claude-sonnet-4-6";
  const currentQuotationModel = settings?.find((s) => s.key === "quotation_ai_model")?.value ?? "claude-sonnet-4-6";

  // Fetch available models from Anthropic API
  let models: { id: string; display_name: string }[] = [];
  try {
    const response = await anthropic.models.list({ limit: 100 });
    models = response.data
      .filter((m) => m.type === "model" && MODEL_META[m.id])
      .map((m) => {
        const meta = MODEL_META[m.id];
        return {
          id: m.id,
          display_name: m.display_name,
          tier: meta?.tier ?? "",
          context: meta?.context ?? "",
          max_output: meta?.maxOutput ?? "",
          input_price: meta?.inputPrice ?? null,
          output_price: meta?.outputPrice ?? null,
          description: meta?.description ?? "",
        };
      })
      .sort((a, b) => (b.output_price ?? 0) - (a.output_price ?? 0));
  } catch (error) {
    console.error("Failed to fetch Anthropic models:", error);
  }

  return Response.json({ current_model: currentModel, current_quotation_model: currentQuotationModel, models });
}

export async function PUT(request: Request) {
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const { model, key } = await request.json();
  if (!model || typeof model !== "string") {
    return Response.json({ error: "model is required" }, { status: 400 });
  }

  const settingKey = key === "quotation_ai_model" ? "quotation_ai_model" : "chat_model";

  const { error } = await supabase
    .from("system_settings")
    .upsert({ key: settingKey, value: model, updated_at: new Date().toISOString() });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, model });
}

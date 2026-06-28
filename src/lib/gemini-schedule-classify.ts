import { calcGeminiCost } from "@/lib/gemini-models";
import { getGeminiApiKey } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";

const MODEL = "gemini-2.5-flash-lite";

interface EventInput {
  id: string;
  title: string;
  description: string | null;
}

interface CategoryInput {
  value: string;
  label: string;
}

interface ProjectInput {
  id: string;
  project_number: string;
  name: string;
}

interface ClassifyResultItem {
  event_id: string;
  category: string;
  project_id: string | null;
}

export async function classifyNewSchedules(scheduleIds: string[]) {
  if (scheduleIds.length === 0) return;

  const apiKey = await getGeminiApiKey();
  if (!apiKey) return;

  const admin = createAdminClient();

  const [schedulesRes, categoriesRes, projectsRes] = await Promise.all([
    admin.from("schedules").select("id, title, description").in("id", scheduleIds),
    admin.from("schedule_categories").select("value, label").order("sort_order"),
    admin.from("projects").select("id, project_number, name").order("name"),
  ]);

  const events = (schedulesRes.data ?? []) as EventInput[];
  const categories = (categoriesRes.data ?? []) as CategoryInput[];
  const projects = (projectsRes.data ?? []) as ProjectInput[];

  if (events.length === 0) return;

  const results = await callGeminiClassify({ apiKey, events, categories, projects });

  // 유효한 카테고리/프로젝트만 필터링 후 업데이트
  const validCategories = new Set(categories.map((c) => c.value));
  const validProjectIds = new Set(projects.map((p) => p.id));

  for (const result of results) {
    const update: Record<string, string | null> = {};

    if (result.category && validCategories.has(result.category)) {
      update.category = result.category;
    }
    if (result.project_id && validProjectIds.has(result.project_id)) {
      update.project_id = result.project_id;
    }

    if (Object.keys(update).length > 0) {
      await admin.from("schedules").update(update).eq("id", result.event_id);
    }
  }
}

async function callGeminiClassify(params: {
  apiKey: string;
  events: EventInput[];
  categories: CategoryInput[];
  projects: ProjectInput[];
}): Promise<ClassifyResultItem[]> {
  const categoryList = params.categories
    .map((c) => `- ${c.value}: ${c.label}`)
    .join("\n");

  const projectList = params.projects
    .map((p) => `- id: ${p.id} | ${p.project_number} ${p.name}`)
    .join("\n");

  const eventList = params.events
    .map((e) => `- event_id: ${e.id} | 제목: ${e.title}${e.description ? ` | 설명: ${e.description.slice(0, 100)}` : ""}`)
    .join("\n");

  const prompt = `당신은 일정 분류 전문가입니다. 아래 일정들의 제목과 설명을 분석하여 카테고리와 프로젝트를 매칭해주세요.

## 카테고리 목록
${categoryList}

## 프로젝트 목록
${projectList}

## 분류할 일정 목록
${eventList}

## 규칙
- 각 일정의 제목/설명을 분석하여 가장 적합한 카테고리를 선택합니다.
- "미팅", "회의", "상담", "방문" 등이 포함되면 meeting
- "강의", "교육", "라이브", "촬영", "코칭", "특강", "해커톤", "연사", "컨퍼런스" 등이 포함되면 lecture
- "출장", "Flight", "Hotel" 등이 포함되면 business_trip
- "휴가", "연차", "노는날" 등이 포함되면 vacation
- "마감", "마감일", "데드라인" 등이 포함되면 deadline
- 프로젝트는 일정 제목에 프로젝트명과 관련된 키워드가 있을 때만 매칭합니다.
- 확신이 없으면 category는 "other", project_id는 null로 설정하세요.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${params.apiKey}`,
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
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    event_id: { type: "string" },
                    category: { type: "string" },
                    project_id: { type: "string", nullable: true },
                  },
                  required: ["event_id", "category"],
                },
              },
            },
            required: ["results"],
          },
          temperature: 0.1,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Gemini schedule classify error:", payload?.error?.message);
    return [];
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
      feature: "schedule_classify",
      model: MODEL,
      input_tokens: promptTokens,
      output_tokens: outputTokens,
      input_cost: inputCost,
      output_cost: outputCost,
      total_cost: totalCost,
      image_count: 0,
      request_summary: `일정 ${params.events.length}건 분류`,
    });
  } catch {
    // ignore logging failures
  }

  try {
    const parsed = JSON.parse(text);
    return parsed.results ?? [];
  } catch {
    return [];
  }
}

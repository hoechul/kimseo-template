import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSystemSettingWithEnvFallback } from "@/lib/system-settings";

export interface AiMatchResult {
  matched: Record<string, string>;
  matchedNames: Record<string, string>;
  model?: string;
  message?: string;
}

interface AiMatchParsed {
  customer_id?: string | null;
  customer_confidence?: "high" | "low" | null;
  project_id?: string | null;
  project_confidence?: "high" | "low" | null;
  lead_id?: string | null;
  lead_confidence?: "high" | "low" | null;
}

type CustomerCandidate = { id: string; name: string; representative_name: string | null };
type ProjectCandidate = {
  id: string;
  project_number: string;
  name: string;
  client: string | null;
  status: string;
};
type LeadCandidate = { id: string; company_name: string; contact_name: string; status: string };

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const CLAUDE_FALLBACK_MODEL = "claude-haiku-4-5-20251001";

function buildPrompts(
  meeting: { title: string; transcript: string; summary: string },
  targetSections: string[]
) {
  const systemPrompt = `당신은 미팅 내용을 분석하여 관련된 고객, 프로젝트, 리드를 매칭하는 전문가입니다.

미팅 제목, 전사록, 요약본을 분석하여 아래 목록에서 확실히 일치하는 항목만 찾아주세요.

규칙:
- 자동 연결은 누락보다 오연결이 더 위험합니다. 조금이라도 애매하면 반드시 null + low를 반환하세요.
- high는 후보 목록의 실제 고객명, 프로젝트명, 프로젝트번호, 리드 회사명이 미팅 제목/전사록/요약본에 글자 그대로 등장하고 문맥상 같은 대상임이 확실한 경우에만 사용합니다.
- 담당자명, 대표자명, 연락처명 단독 언급만으로는 고객/프로젝트/리드를 매칭하지 마세요.
- 프로젝트는 프로젝트번호 또는 프로젝트명이 명시적으로 등장할 때만 매칭합니다. 고객명/client명만 등장하면 프로젝트는 null로 두세요.
- 고객명만 확실히 등장하고 프로젝트명/번호가 없으면 customer_id만 반환하고 project_id는 null로 두세요.
- 후보가 둘 이상 가능하거나 같은 고객의 여러 프로젝트 중 하나로 좁힐 수 없으면 null + low를 반환하세요.
- 목록 순서, 최근 생성 여부, 상태, 업종, 회의 주제, 유사 단어만으로 추측하지 마세요.
- low: 추측, 간접적 단서, 담당자명 단독 언급, 후보가 여러 개인 경우 (→ 실제로는 매칭하지 않음)
- 각 항목은 독립적으로 판단합니다.
- 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "customer_id": "매칭된 고객 id 또는 null",
  "customer_confidence": "high 또는 low",
  "project_id": "매칭된 프로젝트 id 또는 null",
  "project_confidence": "high 또는 low",
  "lead_id": "매칭된 리드 id 또는 null",
  "lead_confidence": "high 또는 low"
}`;

  const userMessage = [
    `## 미팅 제목\n${meeting.title}`,
    `## 전사록\n${meeting.transcript}`,
    meeting.summary ? `## 요약본\n${meeting.summary}` : "",
    "",
    ...targetSections,
    "\n위 미팅 내용을 분석하여 가장 관련성 높은 항목의 id를 JSON으로 응답해주세요.",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userMessage };
}

function parseJsonResponse(rawText: string): AiMatchParsed {
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawText];
  const jsonStr = (jsonMatch[1] || rawText).trim();
  return JSON.parse(jsonStr);
}

function normalizeForExplicitMatch(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function hasUniqueExplicitMention(
  sourceText: string,
  candidateValue: string | null | undefined,
  allCandidateValues: Array<string | null | undefined>
): boolean {
  const normalizedCandidate = normalizeForExplicitMatch(candidateValue);
  if (normalizedCandidate.length < 2) return false;

  const normalizedSource = normalizeForExplicitMatch(sourceText);
  if (!normalizedSource.includes(normalizedCandidate)) return false;

  const sameValueCount = allCandidateValues.filter(
    (value) => normalizeForExplicitMatch(value) === normalizedCandidate
  ).length;

  return sameValueCount === 1;
}

function hasExplicitCustomerMention(
  sourceText: string,
  customer: CustomerCandidate,
  customers: CustomerCandidate[]
): boolean {
  return hasUniqueExplicitMention(
    sourceText,
    customer.name,
    customers.map((candidate) => candidate.name)
  );
}

function hasExplicitProjectMention(
  sourceText: string,
  project: ProjectCandidate,
  projects: ProjectCandidate[]
): boolean {
  return (
    hasUniqueExplicitMention(
      sourceText,
      project.project_number,
      projects.map((candidate) => candidate.project_number)
    ) ||
    hasUniqueExplicitMention(
      sourceText,
      project.name,
      projects.map((candidate) => candidate.name)
    )
  );
}

function hasExplicitLeadMention(
  sourceText: string,
  lead: LeadCandidate,
  leads: LeadCandidate[]
): boolean {
  return hasUniqueExplicitMention(
    sourceText,
    lead.company_name,
    leads.map((candidate) => candidate.company_name)
  );
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<{ parsed: AiMatchParsed; model: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              customer_id: { type: "string", nullable: true },
              customer_confidence: { type: "string", nullable: true },
              project_id: { type: "string", nullable: true },
              project_confidence: { type: "string", nullable: true },
              lead_id: { type: "string", nullable: true },
              lead_confidence: { type: "string", nullable: true },
            },
          },
          temperature: 0.1,
        },
      }),
    }
  );

  if (response.status === 429) {
    throw new Error("RATE_LIMIT");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const msg = payload?.error?.message || `Gemini API error (${response.status})`;
    throw new Error(msg);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  return { parsed: parseJsonResponse(text), model: GEMINI_MODEL };
}

async function callClaude(
  systemPrompt: string,
  userMessage: string
): Promise<{ parsed: AiMatchParsed; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: CLAUDE_FALLBACK_MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return { parsed: parseJsonResponse(rawText), model: CLAUDE_FALLBACK_MODEL };
}

/**
 * 미팅 내용을 AI로 분석하여 고객/프로젝트/리드를 자동매칭한다.
 * Gemini를 우선 사용하고, rate limit 시 Claude Haiku로 폴백한다.
 * 이미 연결된 항목은 건드리지 않는다.
 */
export async function runMeetingAiMatch(
  supabase: SupabaseClient,
  meetingId: string
): Promise<AiMatchResult> {
  // 미팅 조회
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id, title, transcript, summary, project_id, customer_id, lead_id")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) {
    return { matched: {}, matchedNames: {}, message: "미팅을 찾을 수 없습니다." };
  }

  const needProject = !meeting.project_id;
  const needCustomer = !meeting.customer_id;
  const needLead = !meeting.lead_id;

  if (!needProject && !needCustomer && !needLead) {
    return { matched: {}, matchedNames: {}, message: "이미 모두 연결되어 있습니다." };
  }

  const transcript = (meeting.transcript ?? "").trim();
  if (!transcript) {
    return { matched: {}, matchedNames: {}, message: "전사록이 비어있습니다." };
  }

  // 매칭 대상 목록 조회
  const [customersResult, projectsResult, leadsResult] = await Promise.all([
    needCustomer
      ? supabase.from("customers").select("id, name, representative_name").order("name")
      : Promise.resolve({ data: [] as CustomerCandidate[], error: null }),
    needProject
      ? supabase.from("projects").select("id, project_number, name, client, status").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ProjectCandidate[], error: null }),
    needLead
      ? supabase.from("leads").select("id, company_name, contact_name, status").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as LeadCandidate[], error: null }),
  ]);

  const customers = (customersResult.data ?? []) as CustomerCandidate[];
  const projects = (projectsResult.data ?? []) as ProjectCandidate[];
  const leads = (leadsResult.data ?? []) as LeadCandidate[];

  if (customers.length === 0 && projects.length === 0 && leads.length === 0) {
    return { matched: {}, matchedNames: {}, message: "매칭 대상이 없습니다." };
  }

  // 프롬프트 구성
  const targetSections: string[] = [];

  if (needCustomer && customers.length > 0) {
    const list = customers.map((c) => `- id: ${c.id} | ${c.name}${c.representative_name ? ` (대표: ${c.representative_name})` : ""}`).join("\n");
    targetSections.push(`## 고객 목록\n${list}`);
  }

  if (needProject && projects.length > 0) {
    const list = projects.map((p) => `- id: ${p.id} | ${p.project_number} ${p.name}${p.client ? ` (${p.client})` : ""} [${p.status}]`).join("\n");
    targetSections.push(`## 프로젝트 목록\n${list}`);
  }

  if (needLead && leads.length > 0) {
    const list = leads.map((l) => `- id: ${l.id} | ${l.company_name} (${l.contact_name}) [${l.status}]`).join("\n");
    targetSections.push(`## 리드 목록\n${list}`);
  }

  const { systemPrompt, userMessage } = buildPrompts(
    { title: meeting.title, transcript, summary: meeting.summary ?? "" },
    targetSections
  );
  const sourceText = [meeting.title, transcript, meeting.summary ?? ""].join("\n");

  // Gemini 우선 호출, rate limit 시 Claude Haiku 폴백
  let parsed: AiMatchParsed;
  let usedModel: string;

  const geminiApiKey = await getSystemSettingWithEnvFallback("gemini_api_key", "GEMINI_API_KEY");

  if (geminiApiKey) {
    try {
      const result = await callGemini(geminiApiKey, systemPrompt, userMessage);
      parsed = result.parsed;
      usedModel = result.model;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg === "RATE_LIMIT" || msg.includes("429") || msg.includes("quota")) {
        console.warn("Gemini rate limit, falling back to Claude Haiku");
        const result = await callClaude(systemPrompt, userMessage);
        parsed = result.parsed;
        usedModel = result.model;
      } else {
        throw error;
      }
    }
  } else {
    // Gemini API 키가 없으면 바로 Claude Haiku 사용
    const result = await callClaude(systemPrompt, userMessage);
    parsed = result.parsed;
    usedModel = result.model;
  }

  // 유효한 매칭만 필터링
  const updatePayload: Record<string, string> = {};
  const matchedNames: Record<string, string> = {};

  if (needCustomer && parsed.customer_id && parsed.customer_confidence === "high") {
    const found = customers.find((c) => c.id === parsed.customer_id);
    if (found && hasExplicitCustomerMention(sourceText, found, customers)) {
      updatePayload.customer_id = found.id;
      matchedNames.customer = found.name;
    }
  }

  if (needProject && parsed.project_id && parsed.project_confidence === "high") {
    const found = projects.find((p) => p.id === parsed.project_id);
    if (found && hasExplicitProjectMention(sourceText, found, projects)) {
      updatePayload.project_id = found.id;
      matchedNames.project = `${found.project_number} ${found.name}`;
    }
  }

  if (needLead && parsed.lead_id && parsed.lead_confidence === "high") {
    const found = leads.find((l) => l.id === parsed.lead_id);
    if (found && hasExplicitLeadMention(sourceText, found, leads)) {
      updatePayload.lead_id = found.id;
      matchedNames.lead = found.company_name;
    }
  }

  // DB 업데이트
  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await supabase
      .from("meetings")
      .update(updatePayload)
      .eq("id", meetingId);

    if (updateError) {
      throw new Error("매칭 결과 저장 실패: " + updateError.message);
    }
  }

  return { matched: updatePayload, matchedNames, model: usedModel };
}

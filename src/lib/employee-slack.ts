// 직원 이름 → Slack 멤버 ID 매핑 (Slack 멘션 알림용).
// 필요하면 본인 팀 정보로 채워서 사용하세요. 비어 있으면 멘션 대신 이름으로 표시됩니다.
const EMPLOYEE_SLACK_ID_ENTRIES: ReadonlyArray<{ aliases: string[]; slackId: string }> = [];

function normalizeEmployeeName(name: string | null | undefined) {
  return name?.replace(/\s+/g, "").trim() ?? "";
}

function buildNameAliases(name: string) {
  const normalized = normalizeEmployeeName(name);
  const aliases = new Set<string>();

  if (!normalized) return aliases;

  aliases.add(normalized);

  if (/^[가-힣]{3}$/.test(normalized)) {
    aliases.add(`${normalized.slice(1)}${normalized[0]}`);
    aliases.add(`${normalized[2]}${normalized.slice(0, 2)}`);
  }

  return aliases;
}

const EMPLOYEE_SLACK_ID_MAP = new Map<string, string>();

for (const entry of EMPLOYEE_SLACK_ID_ENTRIES) {
  for (const alias of entry.aliases) {
    for (const normalizedAlias of buildNameAliases(alias)) {
      EMPLOYEE_SLACK_ID_MAP.set(normalizedAlias, entry.slackId);
    }
  }
}

export function resolveSlackIdByEmployeeName(name: string | null | undefined) {
  const normalized = normalizeEmployeeName(name);
  if (!normalized) return null;
  return EMPLOYEE_SLACK_ID_MAP.get(normalized) ?? null;
}

export function suggestSlackIdForEmployee(
  name: string | null | undefined,
  currentSlackId: string | null | undefined
) {
  const suggested = resolveSlackIdByEmployeeName(name);
  return currentSlackId?.trim() || suggested || "";
}

export function formatSlackMention(
  slackId: string | null | undefined,
  fallbackName?: string | null
) {
  const normalized = slackId?.trim();
  if (normalized) {
    return `<@${normalized}>`;
  }

  return fallbackName?.trim() || "담당자";
}

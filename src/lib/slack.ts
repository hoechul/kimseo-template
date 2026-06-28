import { formatKstDateTime, formatKstTime, kstTodayLabel, kstTodayRange } from "@/lib/date";
import { formatSlackMention } from "@/lib/employee-slack";
import { getSystemSettings } from "@/lib/system-settings";
import { createAdminClient } from "@/lib/supabase/admin";

const SLACK_SETTING_KEYS = [
  "slack_bot_token",
  "slack_project_channel",
  "slack_meeting_channel",
  "slack_schedule_channel",
  "slack_schedule_time",
  "slack_task_channel",
  "slack_expense_channel",
  "slack_deposit_channel",
  "slack_finance_channel",
  "slack_sms_channel",
  "slack_signing_secret",
  "slack_bot_user_id",
] as const;

const DEFAULT_SCHEDULE_CHANNEL = "#random";
const DEFAULT_SCHEDULE_TIME = "07:00";
const DEFAULT_TASK_CHANNEL = "#할일";
const DEFAULT_EXPENSE_CHANNEL = "#지출";
const DEFAULT_DEPOSIT_CHANNEL = "#알림";
const DEFAULT_FINANCE_CHANNEL = "#재무팀";
const MAX_SLACK_TEXT_LENGTH = 35_000;
const MAX_SLACK_BLOCK_TEXT_LENGTH = 2_900;
const MAX_TASK_DESCRIPTION_LENGTH = 800;

type SlackBlock = Record<string, unknown>;

type ScheduleSlackRow = {
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  google_meet_link: string | null;
  attendees?: Array<{
    employee_id: string;
    employees?: { name: string | null } | { name: string | null }[] | null;
  }> | null;
  projects?:
    | {
        project_number: string | null;
        name: string | null;
      }
    | Array<{
        project_number: string | null;
        name: string | null;
      }>
    | null;
};

type ScheduleReminderEmployee = {
  name: string | null;
  slack_id: string | null;
  is_active: boolean | null;
};

type ScheduleReminderRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  google_meet_link: string | null;
  slack_reminder_sent_at: string | null;
  attendees?: Array<{
    employee_id: string;
    employees?: ScheduleReminderEmployee | ScheduleReminderEmployee[] | null;
  }> | null;
  projects?:
    | {
        project_number: string | null;
        name: string | null;
      }
    | Array<{
        project_number: string | null;
        name: string | null;
      }>
    | null;
};

function normalizeValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeScheduleTime(value: string | null | undefined) {
  const normalized = normalizeValue(value);
  if (!normalized) return null;
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : null;
}

function mrkdwn(text: string): SlackBlock {
  return {
    type: "mrkdwn",
    text,
  };
}

export function convertMarkdownToSlackMrkdwn(markdown: string) {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>")
    .replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_, code: string) => `\`\`\`\n${code.trimEnd()}\n\`\`\``)
    .replace(/^#{1,6}\s+(.+)$/gm, (_, title: string) => `*${title.trim()}*`)
    .replace(/^(\s*)[-*+]\s+\[ \]\s+(.+)$/gm, (_, indent: string, text: string) => {
      return `${indent}• ☐ ${text}`;
    })
    .replace(/^(\s*)[-*+]\s+\[[xX]\]\s+(.+)$/gm, (_, indent: string, text: string) => {
      return `${indent}• ☑ ${text}`;
    })
    .replace(/^(\s*)[-*+]\s+(.+)$/gm, (_, indent: string, text: string) => `${indent}• ${text}`)
    .replace(/^---+$/gm, "────────")
    .replace(/^___+$/gm, "────────")
    .replace(/~~([^~]+)~~/g, "~$1~")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*")
    .trim();
}

function explicitlyRequestsDetailedBlocks(text: string) {
  return /(코드블록|코드\s*전체|전체\s*코드|명령어\s*실행내역|실행내역|터미널\s*로그|로그\s*전체|원문\s*그대로|전체\s*출력|raw output|full output|verbatim|code block|show (?:the )?(?:full )?(?:command|output|log|code))/i.test(
    text
  );
}

export function sanitizeSlackAgentReply(reply: string, userRequest: string) {
  const normalized = reply.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return normalized;
  if (explicitlyRequestsDetailedBlocks(userRequest)) {
    return normalized;
  }

  let removedBlockCount = 0;
  let sanitized = normalized.replace(
    /```[a-zA-Z0-9_-]*\n[\s\S]*?```/g,
    (block: string) => {
      const inner = block
        .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      const lineCount = inner ? inner.split("\n").length : 0;
      if (lineCount <= 3 && inner.length <= 140) {
        return inner;
      }
      removedBlockCount += 1;
      return "";
    }
  );

  const lines = sanitized.split("\n");
  const compacted: string[] = [];
  let shellishRun = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const looksShellish =
      /^(?:\$|>|#)\s+\S+/.test(trimmed) ||
      /^(?:npm|npx|pnpm|yarn|bun|git|rg|sed|cat|ls|find|grep|tsx|node)\b/.test(trimmed) ||
      /^(?:Process exited with code|Wall time:|Chunk ID:|Original token count:|Output:)/.test(trimmed);

    if (looksShellish) {
      shellishRun += 1;
      if (shellishRun >= 2) {
        continue;
      }
    } else {
      shellishRun = 0;
    }

    compacted.push(line);
  }

  sanitized = compacted
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (removedBlockCount > 0) {
    sanitized = `${sanitized}\n\n(코드블록과 명령 실행내역 상세는 생략했습니다. 필요하시면 요청해 주세요.)`.trim();
  }

  return sanitized;
}

function stripSlackMrkdwn(text: string) {
  return text
    .replace(/<([^>|]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
}

function splitSlackMessageText(text: string, maxLength: number = MAX_SLACK_TEXT_LENGTH) {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt < Math.floor(maxLength / 2)) {
      splitAt = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).replace(/^\n+/, "");
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function getAttendeeNames(schedule: ScheduleSlackRow) {
  const names = (schedule.attendees ?? [])
    .map((attendee) => {
      if (Array.isArray(attendee.employees)) {
        return attendee.employees[0]?.name ?? null;
      }
      return attendee.employees?.name ?? null;
    })
    .filter((value): value is string => Boolean(value));

  return names.length > 0 ? names.join(", ") : null;
}

function normalizeReminderEmployee(
  employee: ScheduleReminderEmployee | ScheduleReminderEmployee[] | null | undefined
) {
  return Array.isArray(employee) ? (employee[0] ?? null) : employee ?? null;
}

function getReminderAttendees(schedule: ScheduleReminderRow) {
  return (schedule.attendees ?? [])
    .map((attendee) => normalizeReminderEmployee(attendee.employees))
    .filter((employee): employee is ScheduleReminderEmployee => Boolean(employee))
    .filter((employee) => employee.is_active !== false);
}

function normalizeProject(
  project:
    | { project_number: string | null; name: string | null }
    | Array<{ project_number: string | null; name: string | null }>
    | null
    | undefined
) {
  return Array.isArray(project) ? (project[0] ?? null) : project ?? null;
}

function formatProjectLabel(
  project?:
    | { project_number: string | null; name: string | null }
    | Array<{ project_number: string | null; name: string | null }>
    | null
) {
  const resolvedProject = normalizeProject(project);
  if (!resolvedProject) return null;
  if (resolvedProject.project_number) {
    return `[${resolvedProject.project_number}] ${resolvedProject.name ?? ""}`.trim();
  }
  return resolvedProject.name ?? null;
}

function buildReminderFallbackText(schedule: ScheduleReminderRow) {
  return `${formatKstTime(schedule.start_at)}-${formatKstTime(schedule.end_at)} ${schedule.title}`;
}

function buildUpcomingScheduleReminderBlocks(schedule: ScheduleReminderRow): SlackBlock[] {
  const attendees = getReminderAttendees(schedule);
  const mentionLine =
    attendees.length > 0
      ? attendees.map((employee) => formatSlackMention(employee.slack_id, employee.name)).join(" ")
      : "참석자 없음";
  const projectLabel = formatProjectLabel(schedule.projects);
  const startDate = new Date(schedule.start_at);
  const dateLabel = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
  const dateTimeRange = `${dateLabel} ${formatKstTime(schedule.start_at)}-${formatKstTime(schedule.end_at)}`;

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: mrkdwn(":alarm_clock: 30분 전 일정 알림"),
    },
    { type: "divider" },
    {
      type: "section",
      text: mrkdwn(`*${schedule.title}*`),
    },
    {
      type: "section",
      text: mrkdwn(`*일시*  ${dateTimeRange}`),
    },
  ];

  if (projectLabel || schedule.location) {
    blocks.push({
      type: "section",
      fields: [
        mrkdwn(`*프로젝트*\n${projectLabel ?? "-"}`),
        mrkdwn(`*장소*\n${schedule.location ?? "-"}`),
      ],
    });
  }

  if (schedule.google_meet_link) {
    blocks.push({
      type: "section",
      text: mrkdwn(`:video_camera: *Google Meet*  <${schedule.google_meet_link}|회의 참여하기>`),
    });
  }

  blocks.push(
    {
      type: "context",
      elements: [mrkdwn(`참석자 ${mentionLine}`)],
    },
    {
      type: "context",
      elements: [mrkdwn("자료, 접속 환경, 준비물을 미리 점검해주세요.")],
    }
  );

  return blocks;
}

function formatScheduleLine(schedule: ScheduleSlackRow) {
  const attendeeNames = getAttendeeNames(schedule);
  const timeLabel = schedule.all_day
    ? "종일"
    : `${formatKstTime(schedule.start_at)}-${formatKstTime(schedule.end_at)}`;
  const projectLabel = formatProjectLabel(schedule.projects);
  const details = [
    projectLabel,
    schedule.location,
    attendeeNames ? `참석: ${attendeeNames}` : null,
    schedule.google_meet_link ? `Meet: ${schedule.google_meet_link}` : null,
  ].filter(Boolean);

  return details.length > 0
    ? `• [${timeLabel}] ${schedule.title} (${details.join(" / ")})`
    : `• [${timeLabel}] ${schedule.title}`;
}

export async function getSlackSettings() {
  const settings = await getSystemSettings([...SLACK_SETTING_KEYS]);

  return {
    botToken:
      normalizeValue(settings.slack_bot_token) ??
      normalizeValue(process.env.SLACK_BOT_TOKEN),
    projectChannel:
      normalizeValue(settings.slack_project_channel) ??
      normalizeValue(process.env.SLACK_PROJECT_CHANNEL),
    meetingChannel:
      normalizeValue(settings.slack_meeting_channel) ??
      normalizeValue(process.env.SLACK_MEETING_CHANNEL),
    scheduleChannel:
      normalizeValue(settings.slack_schedule_channel) ??
      normalizeValue(process.env.SLACK_SCHEDULE_CHANNEL) ??
      DEFAULT_SCHEDULE_CHANNEL,
    scheduleTime:
      normalizeScheduleTime(settings.slack_schedule_time) ??
      normalizeScheduleTime(process.env.SLACK_SCHEDULE_TIME) ??
      DEFAULT_SCHEDULE_TIME,
    taskChannel:
      normalizeValue(settings.slack_task_channel) ??
      normalizeValue(process.env.SLACK_TASK_CHANNEL) ??
      DEFAULT_TASK_CHANNEL,
    expenseChannel:
      normalizeValue(settings.slack_expense_channel) ??
      normalizeValue(process.env.SLACK_EXPENSE_CHANNEL) ??
      DEFAULT_EXPENSE_CHANNEL,
    depositChannel:
      normalizeValue(settings.slack_deposit_channel) ??
      normalizeValue(process.env.SLACK_DEPOSIT_CHANNEL) ??
      DEFAULT_DEPOSIT_CHANNEL,
    financeChannel:
      normalizeValue(settings.slack_finance_channel) ??
      normalizeValue(process.env.SLACK_FINANCE_CHANNEL) ??
      DEFAULT_FINANCE_CHANNEL,
    smsChannel:
      normalizeValue(settings.slack_sms_channel) ??
      normalizeValue(process.env.SLACK_SMS_CHANNEL),
    signingSecret:
      normalizeValue(settings.slack_signing_secret) ??
      normalizeValue(process.env.SLACK_SIGNING_SECRET),
    botUserId:
      normalizeValue(settings.slack_bot_user_id) ??
      normalizeValue(process.env.SLACK_BOT_USER_ID),
  };
}

// Slack 봇 토큰이 설정돼 있는지(=연동 활성) 확인. 미설정이면 알림을 조용히 건너뛰는 데 쓴다.
export async function isSlackConfigured(): Promise<boolean> {
  const { botToken } = await getSlackSettings();
  return Boolean(botToken);
}

export async function addSlackReaction({
  channel,
  timestamp,
  name,
  botToken,
}: {
  channel: string;
  timestamp: string;
  name: string;
  botToken: string;
}) {
  const response = await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, timestamp, name }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    const error = data?.error || `Slack reactions.add failed (status ${response.status})`;
    if (error === "already_reacted") {
      return { ok: true, alreadyReacted: true };
    }
    throw new Error(error);
  }

  return { ok: true, alreadyReacted: false };
}

export type SlackThreadMessage = {
  ts: string;
  text: string;
  user: string | null;
  botId: string | null;
};

export async function fetchSlackThreadReplies({
  channel,
  threadTs,
  botToken,
  limit = 30,
}: {
  channel: string;
  threadTs: string;
  botToken: string;
  limit?: number;
}): Promise<SlackThreadMessage[]> {
  const params = new URLSearchParams({
    channel,
    ts: threadTs,
    limit: String(limit),
    inclusive: "true",
  });

  const response = await fetch(
    `https://slack.com/api/conversations.replies?${params.toString()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${botToken}` },
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !Array.isArray(data.messages)) {
    return [];
  }

  return (data.messages as Array<Record<string, unknown>>).map((message) => ({
    ts: typeof message.ts === "string" ? message.ts : "",
    text: typeof message.text === "string" ? message.text : "",
    user: typeof message.user === "string" ? message.user : null,
    botId: typeof message.bot_id === "string" ? message.bot_id : null,
  }));
}

export async function fetchSlackBotUserId(botToken: string): Promise<string | null> {
  const response = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) return null;
  const userId = typeof data?.user_id === "string" ? data.user_id : null;
  return userId;
}

export async function sendSlackMessage({
  channel,
  text,
  botToken,
  blocks,
  threadTs,
}: {
  channel: string;
  text: string;
  botToken: string;
  blocks?: SlackBlock[];
  threadTs?: string;
}) {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text,
      blocks,
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Slack API request failed with status ${response.status}`);
  }

  return data;
}

export async function sendMeetingSummarySlackMessage({
  summary,
}: {
  summary: string;
}) {
  const { botToken, meetingChannel } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  if (!meetingChannel) {
    throw new Error("Slack 미팅 채널이 설정되지 않았습니다.");
  }

  const formattedSummary = convertMarkdownToSlackMrkdwn(summary.trim());
  const chunks = splitSlackMessageText(formattedSummary, MAX_SLACK_BLOCK_TEXT_LENGTH);
  let threadTs: string | undefined;

  for (const chunk of chunks) {
    const response = await sendSlackMessage({
      channel: meetingChannel,
      botToken,
      text: stripSlackMrkdwn(chunk),
      threadTs,
      blocks: [{ type: "section", text: mrkdwn(chunk) }],
    });

    if (!threadTs && typeof response?.ts === "string") {
      threadTs = response.ts;
    }
  }

  return { chunkCount: chunks.length, threadTs: threadTs ?? null };
}

async function openSlackDirectMessageChannel({
  userSlackId,
  botToken,
}: {
  userSlackId: string;
  botToken: string;
}) {
  const response = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      users: userSlackId,
      return_im: true,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok || !data?.channel?.id) {
    throw new Error(data?.error || `Slack conversations.open failed with status ${response.status}`);
  }

  return String(data.channel.id);
}

export async function sendSlackDirectMessage({
  userSlackId,
  text,
  botToken,
  blocks,
}: {
  userSlackId: string;
  text: string;
  botToken: string;
  blocks?: SlackBlock[];
}) {
  const channel = await openSlackDirectMessageChannel({ userSlackId, botToken });

  return sendSlackMessage({
    channel,
    text,
    botToken,
    blocks,
  });
}

export async function sendProjectCreatedSlackMessage(input: {
  projectNumber: string;
  projectName: string;
  customerName?: string | null;
  status?: string | null;
  projectUrl?: string | null;
}) {
  const { botToken, projectChannel } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  if (!projectChannel) {
    throw new Error("Slack 프로젝트 채널이 설정되지 않았습니다.");
  }

  const lines = [
    "새 프로젝트가 생성되었습니다.",
    `프로젝트: ${input.projectNumber} ${input.projectName}`,
    input.customerName ? `고객: ${input.customerName}` : null,
    input.status ? `상태: ${input.status}` : null,
    input.projectUrl ? `링크: ${input.projectUrl}` : null,
  ].filter(Boolean);

  return sendSlackMessage({
    channel: projectChannel,
    botToken,
    text: lines.join("\n"),
  });
}

type TaskSlackAssignee = {
  name: string | null;
  slack_id: string | null;
  is_active: boolean | null;
};

type TaskSlackRow = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  start_date: string | null;
  due_date: string | null;
  created_by: string | null;
  slack_thread_ts: string | null;
  creator: TaskSlackAssignee | TaskSlackAssignee[] | null;
  projects:
    | { project_number: string | null; name: string | null }
    | Array<{ project_number: string | null; name: string | null }>
    | null;
  assignees:
    | Array<{
        employee_id: string;
        employees: TaskSlackAssignee | TaskSlackAssignee[] | null;
      }>
    | null;
};

const TASK_SLACK_SELECT =
  "id, title, description, status, priority, start_date, due_date, created_by, slack_thread_ts, projects(project_number, name), creator:employees!created_by(name, slack_id, is_active), assignees:task_assignees(employee_id, employees(name, slack_id, is_active))";

function normalizeAssignee(
  value: TaskSlackAssignee | TaskSlackAssignee[] | null | undefined
): TaskSlackAssignee | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function statusEmoji(status: string | null) {
  switch (status) {
    case "완료":
      return ":white_check_mark:";
    case "취소":
      return ":x:";
    case "진행중":
      return ":arrow_forward:";
    case "할 일":
      return ":inbox_tray:";
    case "백로그":
      return ":file_folder:";
    default:
      return ":arrows_counterclockwise:";
  }
}

function buildTaskChannelRootBlocks({
  task,
  assignees,
  taskUrl,
  creator,
  shouldMention,
}: {
  task: TaskSlackRow;
  assignees: TaskSlackAssignee[];
  taskUrl: string | null;
  creator: TaskSlackAssignee | null;
  shouldMention: boolean;
}): { blocks: SlackBlock[]; fallback: string } {
  const title = task.title;
  const formatPerson = (slackId: string | null, name: string | null) =>
    shouldMention ? formatSlackMention(slackId, name) : (name?.trim() || "담당자");
  const mentionLine =
    assignees.length > 0
      ? assignees.map((a) => formatPerson(a.slack_id, a.name)).join(" ")
      : "미배정";
  const projectLabel = formatProjectLabel(task.projects);

  const blocks: SlackBlock[] = [
    { type: "section", text: mrkdwn(":memo: *새 할일이 등록되었습니다*") },
    { type: "divider" },
    { type: "section", text: mrkdwn(`*${title}*`) },
  ];

  const fields: SlackBlock[] = [];
  if (task.status) fields.push(mrkdwn(`*상태*\n${task.status}`));
  if (task.priority) fields.push(mrkdwn(`*우선순위*\n${task.priority}`));
  fields.push(mrkdwn(`*담당자*\n${mentionLine}`));
  if (task.due_date) fields.push(mrkdwn(`*마감일*\n${task.due_date}`));
  if (task.start_date) fields.push(mrkdwn(`*시작일*\n${task.start_date}`));
  if (projectLabel) fields.push(mrkdwn(`*프로젝트*\n${projectLabel}`));
  if (fields.length > 0) {
    blocks.push({ type: "section", fields: fields.slice(0, 10) });
  }

  const description = task.description?.trim();
  if (description) {
    const trimmed =
      description.length > MAX_TASK_DESCRIPTION_LENGTH
        ? `${description.slice(0, MAX_TASK_DESCRIPTION_LENGTH)}…`
        : description;
    blocks.push({ type: "section", text: mrkdwn(`*설명*\n${trimmed}`) });
  }

  const contextElements: SlackBlock[] = [];
  if (taskUrl) contextElements.push(mrkdwn(`<${taskUrl}|할일 보러가기>`));
  const creatorLabel = creator ? formatPerson(creator.slack_id, creator.name) : null;
  if (creatorLabel) contextElements.push(mrkdwn(`등록자: ${creatorLabel}`));
  if (contextElements.length > 0) {
    blocks.push({ type: "context", elements: contextElements });
  }

  return { blocks, fallback: `새 할일: ${title}` };
}

function buildTaskStatusReplyBlocks({
  prevStatus,
  newStatus,
  actorName,
}: {
  prevStatus: string | null;
  newStatus: string;
  actorName: string | null;
}): { blocks: SlackBlock[]; fallback: string } {
  const transitionLine = prevStatus
    ? `${statusEmoji(newStatus)} *${prevStatus}* → *${newStatus}*`
    : `${statusEmoji(newStatus)} *${newStatus}*`;

  const blocks: SlackBlock[] = [
    { type: "section", text: mrkdwn(transitionLine) },
  ];
  if (actorName) {
    blocks.push({
      type: "context",
      elements: [mrkdwn(`변경자: ${actorName}`)],
    });
  }

  const fallback = prevStatus
    ? `상태 변경: ${prevStatus} → ${newStatus}`
    : `상태: ${newStatus}`;
  return { blocks, fallback };
}

export async function sendTaskSlackNotification({
  taskId,
  prevStatus,
  newStatus,
  taskUrl,
  actorName,
}: {
  taskId: string;
  prevStatus: string | null;
  newStatus: string;
  taskUrl?: string | null;
  actorName?: string | null;
}): Promise<{ sent: boolean; reason?: string; threadTs?: string | null }> {
  if (prevStatus && prevStatus === newStatus) {
    return { sent: false, reason: "no_change" };
  }

  const { botToken, taskChannel } = await getSlackSettings();
  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }
  if (!taskChannel) {
    throw new Error("Slack 할일 채널이 설정되지 않았습니다.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .select(TASK_SLACK_SELECT)
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    throw new Error(`할일 조회 실패: ${error.message}`);
  }
  if (!data) {
    return { sent: false, reason: "task_not_found" };
  }

  const task = data as unknown as TaskSlackRow;
  const existingThreadTs = task.slack_thread_ts?.trim() || null;

  if (!existingThreadTs && newStatus === "백로그") {
    return { sent: false, reason: "backlog_skipped" };
  }

  const assigneeIds = (task.assignees ?? []).map((row) => row.employee_id);
  const assignees = (task.assignees ?? [])
    .map((row) => normalizeAssignee(row.employees))
    .filter((a): a is TaskSlackAssignee => Boolean(a))
    .filter((a) => a.is_active !== false);

  const creator = normalizeAssignee(task.creator);
  const creatorName = creator?.name ?? null;
  const resolvedActorName = actorName?.trim() || creatorName;

  // 본인이 본인에게 만든 할일은 알림 노이즈가 되므로, 등록자 외 다른 담당자가 있을 때만 멘션한다.
  const shouldMention = task.created_by
    ? assigneeIds.some((id) => id !== task.created_by)
    : assigneeIds.length > 0;

  if (!existingThreadTs) {
    const { blocks, fallback } = buildTaskChannelRootBlocks({
      task,
      assignees,
      taskUrl: taskUrl?.trim() || null,
      creator,
      shouldMention,
    });

    const response = (await sendSlackMessage({
      channel: taskChannel,
      botToken,
      text: fallback,
      blocks,
    })) as { ts?: string };

    const rootTs = typeof response?.ts === "string" ? response.ts : null;
    if (rootTs) {
      await admin
        .from("tasks")
        .update({ slack_thread_ts: rootTs })
        .eq("id", taskId);
    }

    return { sent: true, threadTs: rootTs };
  }

  const { blocks, fallback } = buildTaskStatusReplyBlocks({
    prevStatus,
    newStatus,
    actorName: resolvedActorName,
  });

  await sendSlackMessage({
    channel: taskChannel,
    botToken,
    text: fallback,
    blocks,
    threadTs: existingThreadTs,
  });

  return { sent: true, threadTs: existingThreadTs };
}

type ExpenseSlackEvent =
  | "requested"
  | "approved"
  | "rejected"
  | "scheduled"
  | "paid"
  | "cancelled";

const EXPENSE_STATUS_KO: Record<ExpenseSlackEvent, string> = {
  requested: "결의 요청",
  approved: "승인",
  rejected: "반려",
  scheduled: "지급 예정",
  paid: "지급 완료",
  cancelled: "취소",
};

function expenseEventEmoji(event: ExpenseSlackEvent) {
  switch (event) {
    case "requested":
      return ":memo:";
    case "approved":
      return ":white_check_mark:";
    case "rejected":
      return ":x:";
    case "scheduled":
      return ":date:";
    case "paid":
      return ":moneybag:";
    case "cancelled":
      return ":wastebasket:";
    default:
      return ":arrows_counterclockwise:";
  }
}

type ExpenseSlackRow = {
  id: string;
  title: string;
  status: string | null;
  total_amount: number;
  net_payment_amount: number | null;
  withholding_amount: number | null;
  tax_category: string | null;
  purchase_date: string | null;
  payment_date: string | null;
  rejected_reason: string | null;
  cancelled_reason: string | null;
  slack_thread_ts: string | null;
  vendor_name: string | null;
  vendor:
    | { name: string | null; customer_type: string | null }
    | Array<{ name: string | null; customer_type: string | null }>
    | null;
  projects:
    | { project_number: string | null; name: string | null }
    | Array<{ project_number: string | null; name: string | null }>
    | null;
  expense_types:
    | { name: string | null }
    | Array<{ name: string | null }>
    | null;
  requester:
    | { name: string | null; slack_id: string | null }
    | Array<{ name: string | null; slack_id: string | null }>
    | null;
  approver:
    | { name: string | null; slack_id: string | null }
    | Array<{ name: string | null; slack_id: string | null }>
    | null;
};

const EXPENSE_SLACK_SELECT =
  "id, title, status, total_amount, net_payment_amount, withholding_amount, tax_category, purchase_date, payment_date, rejected_reason, cancelled_reason, slack_thread_ts, vendor_name, vendor:customers!expenses_vendor_id_fkey(name, customer_type), projects(project_number, name), expense_types(name), requester:employees!expenses_requested_by_fkey(name, slack_id), approver:employees!expenses_approver_id_fkey(name, slack_id)";

function normalizeSingle<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function taxCategoryLabel(category: string | null) {
  switch (category) {
    case "personal_withholding":
      return "개인(원천 3.3%)";
    case "business_vat":
      return "사업자(세금계산서)";
    case "corporate_vat":
      return "법인(세금계산서)";
    case "none":
      return "해당없음";
    default:
      return null;
  }
}

function formatWon(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "-";
  return `${amount.toLocaleString("ko-KR")}원`;
}

function buildExpenseRootBlocks({
  expense,
  expenseUrl,
  actorName,
}: {
  expense: ExpenseSlackRow;
  expenseUrl: string | null;
  actorName: string | null;
}): { blocks: SlackBlock[]; fallback: string } {
  const vendor = normalizeSingle(expense.vendor);
  const project = normalizeSingle(expense.projects);
  const expenseType = normalizeSingle(expense.expense_types);
  const approver = normalizeSingle(expense.approver);
  const vendorLabel = vendor?.name || expense.vendor_name || "-";
  const projectLabel = project?.project_number
    ? `[${project.project_number}] ${project.name ?? ""}`.trim()
    : project?.name ?? null;
  const mention = approver
    ? formatSlackMention(approver.slack_id, approver.name)
    : "미배정";
  const taxLabel = taxCategoryLabel(expense.tax_category);

  const blocks: SlackBlock[] = [
    { type: "section", text: mrkdwn(":memo: *새 매입 결의가 올라왔습니다*") },
    { type: "divider" },
    { type: "section", text: mrkdwn(`*${expense.title}*`) },
  ];

  const fields: SlackBlock[] = [
    mrkdwn(`*매입처*\n${vendorLabel}`),
    mrkdwn(`*매입총액*\n${formatWon(expense.total_amount)}`),
  ];
  if (taxLabel) fields.push(mrkdwn(`*매입구분*\n${taxLabel}`));
  if (expense.withholding_amount && expense.withholding_amount > 0) {
    fields.push(mrkdwn(`*원천징수*\n${formatWon(expense.withholding_amount)}`));
    fields.push(mrkdwn(`*실지급액*\n${formatWon(expense.net_payment_amount)}`));
  }
  if (expense.purchase_date)
    fields.push(mrkdwn(`*매입일*\n${expense.purchase_date}`));
  if (expense.payment_date)
    fields.push(mrkdwn(`*지급일*\n${expense.payment_date}`));
  if (expenseType?.name) fields.push(mrkdwn(`*유형*\n${expenseType.name}`));
  if (projectLabel) fields.push(mrkdwn(`*프로젝트*\n${projectLabel}`));
  fields.push(mrkdwn(`*승인자*\n${mention}`));

  blocks.push({ type: "section", fields: fields.slice(0, 10) });

  const context: SlackBlock[] = [];
  if (expenseUrl) context.push(mrkdwn(`<${expenseUrl}|매입 상세 보러가기>`));
  if (actorName) context.push(mrkdwn(`요청자: ${actorName}`));
  if (context.length > 0) {
    blocks.push({ type: "context", elements: context });
  }

  return {
    blocks,
    fallback: `새 매입 결의: ${expense.title} ${formatWon(expense.total_amount)}`,
  };
}

function buildExpenseReplyBlocks({
  event,
  expense,
  actorName,
  reason,
}: {
  event: ExpenseSlackEvent;
  expense: ExpenseSlackRow;
  actorName: string | null;
  reason: string | null;
}): { blocks: SlackBlock[]; fallback: string } {
  const emoji = expenseEventEmoji(event);
  const label = EXPENSE_STATUS_KO[event];
  const approver = normalizeSingle(expense.approver);
  const requester = normalizeSingle(expense.requester);

  const mentionTargets: string[] = [];
  if (event === "approved" || event === "rejected" || event === "paid") {
    if (requester) {
      mentionTargets.push(formatSlackMention(requester.slack_id, requester.name));
    }
  }
  if (event === "requested" && approver) {
    mentionTargets.push(formatSlackMention(approver.slack_id, approver.name));
  }
  const mentionLine = mentionTargets.length > 0 ? `  ${mentionTargets.join(" ")}` : "";

  const detailLines: string[] = [];
  if (event === "paid") {
    detailLines.push(
      `*지급일*: ${expense.payment_date ?? "-"}`,
      `*실지급액*: ${formatWon(expense.net_payment_amount ?? expense.total_amount)}`
    );
  }
  if (event === "scheduled" && expense.payment_date) {
    detailLines.push(`*지급예정일*: ${expense.payment_date}`);
  }
  if ((event === "rejected" || event === "cancelled") && reason) {
    detailLines.push(`*사유*: ${reason}`);
  }

  const headline = `${emoji} *${label}*${mentionLine}`;
  const body = detailLines.length > 0 ? `${headline}\n${detailLines.join("\n")}` : headline;

  const blocks: SlackBlock[] = [{ type: "section", text: mrkdwn(body) }];
  if (actorName) {
    blocks.push({ type: "context", elements: [mrkdwn(`변경자: ${actorName}`)] });
  }

  return { blocks, fallback: `${label}: ${expense.title}` };
}

export async function sendExpenseSlackNotification({
  expenseId,
  event,
  expenseUrl,
  actorName,
  reason,
}: {
  expenseId: string;
  event: ExpenseSlackEvent;
  expenseUrl?: string | null;
  actorName?: string | null;
  reason?: string | null;
}): Promise<{ sent: boolean; reason?: string; threadTs?: string | null }> {
  const { botToken, expenseChannel } = await getSlackSettings();
  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }
  if (!expenseChannel) {
    throw new Error("Slack 매입 채널이 설정되지 않았습니다.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expenses")
    .select(EXPENSE_SLACK_SELECT)
    .eq("id", expenseId)
    .maybeSingle();

  if (error) {
    throw new Error(`매입 조회 실패: ${error.message}`);
  }
  if (!data) {
    return { sent: false, reason: "expense_not_found" };
  }

  const expense = data as unknown as ExpenseSlackRow;
  const existingThreadTs = expense.slack_thread_ts?.trim() || null;

  if (!existingThreadTs) {
    // 루트 메시지: 결의 요청 시점에만 생성. 이전 단계 이벤트(cancelled 등)는 스레드 없이 스킵.
    if (event !== "requested") {
      return { sent: false, reason: "no_thread_yet" };
    }

    const requester = normalizeSingle(expense.requester);
    const resolvedActorName = actorName?.trim() || requester?.name || null;
    const { blocks, fallback } = buildExpenseRootBlocks({
      expense,
      expenseUrl: expenseUrl?.trim() || null,
      actorName: resolvedActorName,
    });

    const response = (await sendSlackMessage({
      channel: expenseChannel,
      botToken,
      text: fallback,
      blocks,
    })) as { ts?: string };

    const rootTs = typeof response?.ts === "string" ? response.ts : null;
    if (rootTs) {
      await admin
        .from("expenses")
        .update({ slack_thread_ts: rootTs })
        .eq("id", expenseId);
    }

    return { sent: true, threadTs: rootTs };
  }

  const { blocks, fallback } = buildExpenseReplyBlocks({
    event,
    expense,
    actorName: actorName?.trim() || null,
    reason: reason?.trim() || null,
  });

  await sendSlackMessage({
    channel: expenseChannel,
    botToken,
    text: fallback,
    blocks,
    threadTs: existingThreadTs,
  });

  return { sent: true, threadTs: existingThreadTs };
}

export async function sendDepositSlackNotification({
  depositorName,
  amount,
}: {
  depositorName: string;
  amount: number;
}) {
  const { botToken, depositChannel } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  if (!depositChannel) {
    throw new Error("Slack 입금 알림 채널이 설정되지 않았습니다.");
  }

  const formattedAmount = `${amount.toLocaleString("ko-KR")}원`;
  const fallback = `${depositorName}에서 ${formattedAmount} 입금되었습니다`;

  return sendSlackMessage({
    channel: depositChannel,
    botToken,
    text: fallback,
    blocks: [
      { type: "section", text: mrkdwn(":moneybag: *입금 알림*") },
      { type: "divider" },
      {
        type: "section",
        text: mrkdwn(`*${depositorName}* 님에게서\n*${formattedAmount}* 입금되었습니다`),
      },
    ],
  });
}

type TaxInvoiceSlackCustomer = {
  name: string | null;
  business_number: string | null;
};

type TaxInvoiceSlackProject = {
  project_number: string | null;
  name: string | null;
  client: string | null;
  customers: TaxInvoiceSlackCustomer | TaxInvoiceSlackCustomer[] | null;
};

type TaxInvoiceSlackRevenueRow = {
  id: string;
  title: string;
  total_amount: number | null;
  supply_amount: number | null;
  vat_amount: number | null;
  revenue_date: string | null;
  tax_invoice_date: string | null;
  tax_invoice_issued_at: string | null;
  tax_invoice_url: string | null;
  tax_invoice_issuance_key: string | null;
  tax_invoice_nts_transaction_id: string | null;
  projects: TaxInvoiceSlackProject | TaxInvoiceSlackProject[] | null;
};

const TAX_INVOICE_SLACK_SELECT = `
  id,
  title,
  total_amount,
  supply_amount,
  vat_amount,
  revenue_date,
  tax_invoice_date,
  tax_invoice_issued_at,
  tax_invoice_url,
  tax_invoice_issuance_key,
  tax_invoice_nts_transaction_id,
  projects(
    project_number,
    name,
    client,
    customers(
      name,
      business_number
    )
  )
`;

function formatOptionalKstDateTime(iso: string | null | undefined) {
  return iso ? formatKstDateTime(iso) : "-";
}

function formatTaxInvoiceProject(project: TaxInvoiceSlackProject | null) {
  if (!project) return null;
  if (project.project_number) {
    return `[${project.project_number}] ${project.name ?? ""}`.trim();
  }
  return project.name ?? null;
}

function buildTaxInvoiceIssuedBlocks({
  revenue,
  revenueUrl,
}: {
  revenue: TaxInvoiceSlackRevenueRow;
  revenueUrl: string | null;
}): { blocks: SlackBlock[]; fallback: string } {
  const project = normalizeSingle(revenue.projects);
  const customer = normalizeSingle(project?.customers);
  const customerLabel = customer?.name ?? project?.client ?? "-";
  const projectLabel = formatTaxInvoiceProject(project);
  const taxInvoiceUrl = revenue.tax_invoice_url?.trim() || null;

  const fields: SlackBlock[] = [
    mrkdwn(`*거래처*\n${customerLabel}`),
    mrkdwn(`*총액*\n${formatWon(revenue.total_amount)}`),
    mrkdwn(`*공급가액*\n${formatWon(revenue.supply_amount)}`),
    mrkdwn(`*부가세*\n${formatWon(revenue.vat_amount)}`),
    mrkdwn(`*발행일*\n${revenue.tax_invoice_date ?? "-"}`),
    mrkdwn(`*발행시각*\n${formatOptionalKstDateTime(revenue.tax_invoice_issued_at)}`),
  ];

  if (projectLabel) {
    fields.push(mrkdwn(`*프로젝트*\n${projectLabel}`));
  }
  if (customer?.business_number) {
    fields.push(mrkdwn(`*사업자번호*\n${customer.business_number}`));
  }
  if (revenue.tax_invoice_nts_transaction_id) {
    fields.push(mrkdwn(`*국세청 승인번호*\n${revenue.tax_invoice_nts_transaction_id}`));
  }
  if (revenue.tax_invoice_issuance_key) {
    fields.push(mrkdwn(`*발행키*\n${revenue.tax_invoice_issuance_key}`));
  }

  const blocks: SlackBlock[] = [
    { type: "section", text: mrkdwn(":receipt: *세금계산서 발행 완료*") },
    { type: "divider" },
    { type: "section", text: mrkdwn(`*${revenue.title}*`) },
    { type: "section", fields: fields.slice(0, 10) },
  ];

  const context: SlackBlock[] = [];
  if (taxInvoiceUrl) {
    context.push(mrkdwn(`<${taxInvoiceUrl}|세금계산서 보기>`));
  }
  if (revenueUrl) {
    context.push(mrkdwn(`<${revenueUrl}|매출 상세 보기>`));
  }
  if (context.length > 0) {
    blocks.push({ type: "context", elements: context });
  }

  return {
    blocks,
    fallback: `세금계산서 발행 완료: ${revenue.title} ${formatWon(revenue.total_amount)}`,
  };
}

export async function sendTaxInvoiceIssuedSlackNotification({
  revenueId,
  revenueUrl,
}: {
  revenueId: string;
  revenueUrl?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const { botToken, financeChannel } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  if (!financeChannel) {
    throw new Error("Slack 재무팀 채널이 설정되지 않았습니다.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("revenues")
    .select(TAX_INVOICE_SLACK_SELECT)
    .eq("id", revenueId)
    .maybeSingle();

  if (error) {
    throw new Error(`매출 조회 실패: ${error.message}`);
  }
  if (!data) {
    return { sent: false, reason: "revenue_not_found" };
  }

  const revenue = data as unknown as TaxInvoiceSlackRevenueRow;
  const { blocks, fallback } = buildTaxInvoiceIssuedBlocks({
    revenue,
    revenueUrl: revenueUrl?.trim() || null,
  });

  await sendSlackMessage({
    channel: financeChannel,
    botToken,
    text: fallback,
    blocks,
  });

  return { sent: true };
}

export async function sendSlackProjectTestMessage() {
  const now = new Date().toISOString();
  const { botToken, projectChannel } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  if (!projectChannel) {
    throw new Error("Slack 프로젝트 채널이 설정되지 않았습니다.");
  }

  return sendSlackMessage({
    channel: projectChannel,
    botToken,
    text: `슬랙 프로젝트 알림 테스트입니다.\n채널 연결이 정상입니다.\n시각: ${now}`,
  });
}

export async function buildTodayScheduleSlackText(now: Date = new Date()) {
  const admin = createAdminClient();
  const { todayStart, tomorrowStart } = kstTodayRange(now);

  const { data, error } = await admin
    .from("schedules")
    .select(
      "title, start_at, end_at, all_day, location, google_meet_link, attendees:schedule_attendees(employee_id, employees(name)), projects(project_number, name)"
    )
    .lt("start_at", tomorrowStart)
    .gte("end_at", todayStart)
    .order("all_day", { ascending: false })
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const schedules = (data ?? []) as unknown as ScheduleSlackRow[];
  const header = ["오늘의 일정", kstTodayLabel(now)];

  if (schedules.length === 0) {
    return [...header, "", "오늘 등록된 일정이 없습니다."].join("\n");
  }

  return [...header, "", ...schedules.map(formatScheduleLine)].join("\n");
}

export async function sendDailyScheduleSlackMessage(now: Date = new Date()) {
  const { botToken, scheduleChannel } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  if (!scheduleChannel) {
    throw new Error("Slack 일정 공유 채널이 설정되지 않았습니다.");
  }

  return sendSlackMessage({
    channel: scheduleChannel,
    botToken,
    text: await buildTodayScheduleSlackText(now),
  });
}

export async function sendUpcomingScheduleReminderSlackMessages(now: Date = new Date()) {
  const { botToken } = await getSlackSettings();

  if (!botToken) {
    throw new Error("Slack Bot Token이 설정되지 않았습니다.");
  }

  const admin = createAdminClient();
  const windowStart = new Date(now.getTime() + 29 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 31 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("schedules")
    .select(
      "id, title, start_at, end_at, all_day, location, google_meet_link, slack_reminder_sent_at, attendees:schedule_attendees(employee_id, employees(name, slack_id, is_active)), projects(project_number, name)"
    )
    .eq("all_day", false)
    .is("slack_reminder_sent_at", null)
    .gte("start_at", windowStart)
    .lt("start_at", windowEnd)
    .order("start_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const schedules = (data ?? []) as ScheduleReminderRow[];
  if (schedules.length === 0) {
    return { count: 0, scheduleIds: [] as string[], recipientCount: 0 };
  }

  const scheduleIds: string[] = [];
  const sentReminderKeys = new Set<string>();

  for (const schedule of schedules) {
    const attendees = getReminderAttendees(schedule).filter((employee) =>
      Boolean(employee.slack_id?.trim())
    );
    const text = buildReminderFallbackText(schedule);
    const blocks = buildUpcomingScheduleReminderBlocks(schedule);

    for (const attendee of attendees) {
      const slackId = attendee.slack_id?.trim();
      if (!slackId) continue;

      const dedupeKey = `${schedule.id}:${slackId}`;
      if (sentReminderKeys.has(dedupeKey)) continue;

      await sendSlackDirectMessage({
        userSlackId: slackId,
        botToken,
        text,
        blocks,
      });
      sentReminderKeys.add(dedupeKey);
    }

    const { error: updateError } = await admin
      .from("schedules")
      .update({ slack_reminder_sent_at: now.toISOString() })
      .eq("id", schedule.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    scheduleIds.push(schedule.id);
  }

  return { count: scheduleIds.length, scheduleIds, recipientCount: sentReminderKeys.size };
}

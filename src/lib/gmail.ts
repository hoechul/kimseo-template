import { google } from "googleapis";

/** refresh token 만료/폐기 등 재인증이 필요한 에러 */
export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

export function getAuthUrl(state?: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
}

export type TokenData = {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email: string;
};

export async function exchangeCode(code: string): Promise<TokenData> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token ?? "",
    expiry_date: tokens.expiry_date!,
    email: data.email!,
  };
}

export async function getGmailClient(
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
  options?: { onTokenRefreshed?: (newAccessToken: string, newExpiry: number) => void }
) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
  });

  // 토큰 갱신 저장은 프로액티브 갱신에서 처리, 이벤트 핸들러는 API 호출 중 자동 갱신만 담당
  let proactiveRefreshDone = false;

  client.on("tokens", (tokens) => {
    if (proactiveRefreshDone) return;
    if (tokens.access_token && options?.onTokenRefreshed) {
      options.onTokenRefreshed(tokens.access_token, tokens.expiry_date ?? Date.now() + 3600_000);
    }
  });

  // 만료 5분 전부터 선제 갱신
  if (!expiryDate || isNaN(expiryDate) || expiryDate < Date.now() + 5 * 60_000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      proactiveRefreshDone = true;
      if (credentials.access_token && options?.onTokenRefreshed) {
        options.onTokenRefreshed(
          credentials.access_token,
          credentials.expiry_date ?? Date.now() + 3600_000
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Token refresh failed:", errMsg);
      const lower = errMsg.toLowerCase();
      if (lower.includes("invalid_client")) {
        throw new GmailAuthError("Google OAuth 클라이언트 인증 정보가 유효하지 않습니다. 환경변수(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)를 확인하거나 Google 계정을 다시 연결해주세요.");
      }
      if (lower.includes("invalid_grant") || lower.includes("token has been expired") || lower.includes("token has been revoked")) {
        throw new GmailAuthError("Google 인증이 만료되었습니다. 계정을 다시 연결해주세요.");
      }
      throw new Error(`Gmail 토큰 갱신 실패: ${errMsg}`);
    }
  }

  return google.gmail({ version: "v1", auth: client });
}

export type GmailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  snippet: string;
  isRead: boolean;
  labelIds: string[];
};

export type GmailMessageDetail = GmailMessage & {
  body: string;
  bodyHtml: string;
  cc?: string;
  attachments: { filename: string; mimeType: string; attachmentId: string; size: number }[];
};

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFromHeader(from: string): { email: string; name: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1].replace(/^"(.*)"$/, "$1").trim(), email: match[2].trim() };
  }
  return { name: from, email: from };
}

function decodeBase64(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

type MailPart = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: MailPart[] | null;
};

function extractBody(payload: MailPart): { text: string; html: string; attachments: GmailMessageDetail["attachments"] } {
  const attachments: GmailMessageDetail["attachments"] = [];

  function walk(part: MailPart): { text: string; html: string } {
    if (!part) return { text: "", html: "" };

    if (part.mimeType === "text/plain" && part.body?.data) {
      return { text: decodeBase64(part.body.data), html: "" };
    }
    if (part.mimeType === "text/html" && part.body?.data) {
      return { text: "", html: decodeBase64(part.body.data) };
    }

    if (part.parts) {
      let text = "";
      let html = "";
      for (const p of part.parts) {
        if (p.filename && p.body?.attachmentId) {
          attachments.push({
            filename: p.filename,
            mimeType: p.mimeType ?? "",
            attachmentId: p.body.attachmentId,
            size: p.body.size ?? 0,
          });
          continue;
        }
        const res = walk(p);
        text += res.text;
        html += res.html;
      }
      return { text, html };
    }

    return { text: "", html: "" };
  }

  const { text, html } = walk(payload);
  return { text, html, attachments };
}

export async function listMessages(
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
  options: { q?: string; pageToken?: string; maxResults?: number } = {},
  tokenOptions?: { onTokenRefreshed?: (newAccessToken: string, newExpiry: number) => void }
): Promise<{ messages: GmailMessage[]; nextPageToken?: string; totalEstimate?: number }> {
  const gmail = await getGmailClient(accessToken, refreshToken, expiryDate, tokenOptions);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: options.q
      ? `${options.q} -category:promotions -category:social`
      : "in:inbox -category:promotions -category:social",
    pageToken: options.pageToken,
    maxResults: options.maxResults ?? 30,
  });

  const ids = listRes.data.messages ?? [];
  if (ids.length === 0) {
    return { messages: [], nextPageToken: listRes.data.nextPageToken ?? undefined };
  }

  const details = await Promise.all(
    ids.map((m) =>
      gmail.users.messages.get({ userId: "me", id: m.id!, format: "metadata", metadataHeaders: ["Subject", "From", "To", "Date"] })
    )
  );

  const messages: GmailMessage[] = details.map((res) => {
    const msg = res.data;
    const headers = msg.payload?.headers ?? [];
    const from = getHeader(headers, "From");
    const { name: fromName, email: fromEmail } = parseFromHeader(from);
    return {
      id: msg.id!,
      threadId: msg.threadId!,
      subject: getHeader(headers, "Subject") || "(제목 없음)",
      from: fromEmail,
      fromName,
      to: getHeader(headers, "To"),
      date: getHeader(headers, "Date"),
      snippet: msg.snippet ?? "",
      isRead: !msg.labelIds?.includes("UNREAD"),
      labelIds: msg.labelIds ?? [],
    };
  });

  return {
    messages,
    nextPageToken: listRes.data.nextPageToken ?? undefined,
    totalEstimate: listRes.data.resultSizeEstimate ?? undefined,
  };
}

export async function getMessage(
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
  messageId: string,
  tokenOptions?: { onTokenRefreshed?: (newAccessToken: string, newExpiry: number) => void }
): Promise<GmailMessageDetail> {
  const gmail = await getGmailClient(accessToken, refreshToken, expiryDate, tokenOptions);

  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const msg = res.data;
  const headers = msg.payload?.headers ?? [];
  const from = getHeader(headers, "From");
  const { name: fromName, email: fromEmail } = parseFromHeader(from);

  const { text, html, attachments } = extractBody(msg.payload as MailPart);

  return {
    id: msg.id!,
    threadId: msg.threadId!,
    subject: getHeader(headers, "Subject") || "(제목 없음)",
    from: fromEmail,
    fromName,
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc") || undefined,
    date: getHeader(headers, "Date"),
    snippet: msg.snippet ?? "",
    isRead: !msg.labelIds?.includes("UNREAD"),
    labelIds: msg.labelIds ?? [],
    body: text,
    bodyHtml: html,
    attachments,
  };
}

export async function markAsRead(
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
  messageId: string,
  tokenOptions?: { onTokenRefreshed?: (newAccessToken: string, newExpiry: number) => void }
) {
  const gmail = await getGmailClient(accessToken, refreshToken, expiryDate, tokenOptions);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

export async function sendEmail(
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
  options: { to: string; subject: string; body: string; replyToMessageId?: string; threadId?: string },
  tokenOptions?: { onTokenRefreshed?: (newAccessToken: string, newExpiry: number) => void }
) {
  const gmail = await getGmailClient(accessToken, refreshToken, expiryDate, tokenOptions);

  const headers = [
    `To: ${options.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];

  if (options.replyToMessageId) {
    headers.push(`In-Reply-To: ${options.replyToMessageId}`);
    headers.push(`References: ${options.replyToMessageId}`);
  }

  const raw = [headers.join("\r\n"), "", Buffer.from(options.body).toString("base64")].join("\r\n");
  const encodedRaw = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedRaw, threadId: options.threadId },
  });
}

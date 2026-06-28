/**
 * 한국 카드사 SMS 알림 파서.
 * Tasker가 보낸 raw text에서 카드 끝 4자리·금액·가맹점·승인시각·카드사를 추출한다.
 *
 * 다양한 포맷을 견디기 위해 한 번에 매칭하기보다 필드별 정규식을 따로 적용하고,
 * 빠진 필드가 있어도 amount/approved_at은 채워서 row 자체는 만든다 (raw_text 보존).
 */

export interface ParsedCardSms {
  amount: number; // 원화 결제 금액 (외화면 0)
  last4: string | null;
  merchant: string | null;
  approvedAt: Date;
  issuer: string | null;
  currency: string; // 기본 "KRW", 외화면 "USD"/"EUR" 등
  foreignAmount: number | null; // 외화 금액 (KRW면 null)
  status: "parsed" | "partial" | "failed";
}

const ISSUER_PATTERNS: Array<{ keyword: RegExp; name: string }> = [
  { keyword: /신한카드/, name: "신한" },
  { keyword: /삼성카드/, name: "삼성" },
  { keyword: /현대카드/, name: "현대" },
  { keyword: /KB.{0,2}국민카드|국민카드/, name: "KB국민" },
  { keyword: /롯데카드/, name: "롯데" },
  { keyword: /하나카드/, name: "하나" },
  { keyword: /BC카드|비씨카드/, name: "BC" },
  { keyword: /우리카드/, name: "우리" },
  { keyword: /NH카드|농협카드|NH(?:기업|개인)/, name: "NH농협" },
  { keyword: /씨티카드/, name: "씨티" },
  { keyword: /카카오뱅크.*카드/, name: "카카오뱅크" },
];

function extractIssuer(text: string): string | null {
  for (const { keyword, name } of ISSUER_PATTERNS) {
    if (keyword.test(text)) return name;
  }
  return null;
}

function extractLast4(text: string): string | null {
  // 카드사명(1234) 또는 카드(1234) 또는 *1234 패턴
  const patterns = [
    /카드\s*\((\d{4})\)/,
    /\((\d{4})\)\s*승인/,
    /[*•·•·]{2,}\s*(\d{4})/,
    /(?:끝|뒷)\s*4자리[:\s]*(\d{4})/,
    // 카드사명 직후 4자리 (예: "NH기업9133", "NH개인1234")
    /(?:NH(?:기업|개인|카드)|신한카드|삼성카드|현대카드|국민카드|롯데카드|하나카드|BC카드|우리카드|씨티카드)\s*(\d{4})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractForeignCurrency(text: string): { currency: string; amount: number } | null {
  // "USD 12.50", "EUR 8.00" 등
  const match = text.match(/\b(USD|EUR|JPY|CNY|GBP|AUD|CAD|HKD|SGD|THB|VND)\s+([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const currency = match[1].toUpperCase();
  const amount = parseFloat(match[2].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  return { currency, amount };
}

function extractAmount(text: string): number {
  // 12,500원 / 12500원 / 12,500 원
  const match = text.match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/);
  if (!match) return 0;
  const num = parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(num) ? num : 0;
}

function isCancellation(text: string): boolean {
  return /승인\s*취소|승인취소/.test(text);
}

function extractApprovedAt(text: string, fallback: Date): Date {
  // MM/DD HH:mm 또는 MM-DD HH:mm 또는 MM월 DD일 HH:mm
  // 카드사 SMS의 시각은 항상 한국 시간(KST = UTC+09:00).
  // 서버(Vercel)는 UTC로 동작하므로 명시적으로 +09:00 offset을 붙여 파싱한다.
  const slash = text.match(/(\d{1,2})\s*[/\-월]\s*(\d{1,2})\s*[일]?\s*(\d{1,2}):(\d{2})/);
  if (slash) {
    const [, mmRaw, ddRaw, hhRaw, miRaw] = slash;
    const year = fallback.getUTCFullYear();
    const mm = mmRaw.padStart(2, "0");
    const dd = ddRaw.padStart(2, "0");
    const hh = hhRaw.padStart(2, "0");
    const mi = miRaw.padStart(2, "0");
    const d = new Date(`${year}-${mm}-${dd}T${hh}:${mi}:00+09:00`);
    // 미래 날짜로 파싱되면 (예: 12/31에 1/1 SMS 도착) 전년도로 보정
    if (d.getTime() - fallback.getTime() > 7 * 24 * 60 * 60 * 1000) {
      d.setUTCFullYear(year - 1);
    }
    return d;
  }
  return fallback;
}

function extractMerchant(text: string): string | null {
  // 흔한 노이즈 라벨 제거 후 마지막 줄을 가맹점으로 보는 휴리스틱
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^\[?(Web발신|광고|알림)\]?$/i.test(line));

  // "누계 ... 원" 같은 라인 제거
  const filtered = lines.filter((line) => !/누계|잔여|이용금액합계/.test(line));

  // 가맹점 추출 1: "일시불" 토큰 뒤
  const ilsibulMatch = text.match(/일시불\s+([^\n]{1,40})/);
  if (ilsibulMatch) {
    const cand = ilsibulMatch[1].split(/\s{2,}|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}|누계/)[0].trim();
    if (cand && cand.length >= 2 && !/^\d+$/.test(cand)) return cand;
  }

  // 가맹점 추출 2: 시각 패턴 뒤의 텍스트
  const afterTime = text.match(/\d{1,2}:\d{2}\s+([^\n]{1,40})/);
  if (afterTime) {
    const cand = afterTime[1].split(/누계|잔여|\d{1,3}(?:,\d{3})*원/)[0].trim();
    if (cand && cand.length >= 2) return cand;
  }

  // 가맹점 추출 3: 마지막 줄 fallback
  const last = filtered[filtered.length - 1];
  if (last && last.length <= 60 && !/원$|\d{1,2}:\d{2}/.test(last)) {
    return last;
  }

  return null;
}

export function parseCardSms(text: string, receivedAt?: Date): ParsedCardSms {
  const fallback = receivedAt ?? new Date();
  const cancelled = isCancellation(text);
  const amount = extractAmount(text) * (cancelled ? -1 : 1);
  const last4 = extractLast4(text);
  const merchant = extractMerchant(text);
  const approvedAt = extractApprovedAt(text, fallback);
  const issuer = extractIssuer(text);
  const foreign = extractForeignCurrency(text);

  const currency = foreign ? foreign.currency : "KRW";
  const foreignAmount = foreign ? foreign.amount * (cancelled ? -1 : 1) : null;
  const isForeign = currency !== "KRW";

  let status: ParsedCardSms["status"];
  if (!isForeign && amount === 0) {
    status = "failed";
  } else if (isForeign && (foreignAmount ?? 0) === 0) {
    // 외화 USD 0.00 같은 점검성 결제 — row는 만들되 partial
    status = "partial";
  } else if (!last4 || !merchant) {
    status = "partial";
  } else {
    status = "parsed";
  }

  return { amount, last4, merchant, approvedAt, issuer, currency, foreignAmount, status };
}

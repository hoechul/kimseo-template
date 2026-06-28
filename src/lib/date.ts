const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Returns a Date shifted to KST (for extracting hours/minutes/date in KST via UTC getters).
 */
export function toKstDate(date: Date = new Date()): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

/**
 * Returns YYYY-MM-DD in KST.
 */
export function toKstDateString(date: Date = new Date()): string {
  return toKstDate(date).toISOString().slice(0, 10);
}

/**
 * Returns KST "today" start as ISO string (midnight KST = previous day 15:00 UTC).
 */
export function kstTodayRange(date: Date = new Date()): { todayStart: string; tomorrowStart: string; weekEnd: string } {
  const nowKst = toKstDate(date);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate();
  // midnight KST = UTC - 9h
  const todayMidnightUtc = new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
  const tomorrowMidnightUtc = new Date(todayMidnightUtc.getTime() + 24 * 60 * 60 * 1000);
  const weekEndUtc = new Date(tomorrowMidnightUtc.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    todayStart: todayMidnightUtc.toISOString(),
    tomorrowStart: tomorrowMidnightUtc.toISOString(),
    weekEnd: weekEndUtc.toISOString(),
  };
}

/**
 * Format an ISO datetime to KST HH:MM.
 */
export function formatKstTime(iso: string): string {
  const d = toKstDate(new Date(iso));
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

/**
 * Format an ISO datetime to KST M/D (요일).
 */
export function formatKstDateLabel(iso: string): string {
  const d = toKstDate(new Date(iso));
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${weekDays[d.getUTCDay()]})`;
}

/**
 * Returns KST "today" label like "2026. 3. 7. (토)".
 */
export function kstTodayLabel(date: Date = new Date()): string {
  const d = toKstDate(date);
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. (${weekDays[d.getUTCDay()]})`;
}

/**
 * Adds days to a YYYY-MM-DD date string (interpreted in KST date context)
 * and returns YYYY-MM-DD.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map((value) => Number(value));

  if (!year || !month || !day) {
    return toKstDateString();
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Format an ISO datetime to KST YYYY-MM-DD HH:MM.
 */
export function formatKstDateTime(iso: string): string {
  const d = toKstDate(new Date(iso));
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

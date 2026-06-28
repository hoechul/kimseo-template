import { normalizeTaskStatus } from "@/lib/task-status";
import type { Task } from "@/lib/types";

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday-start week containing the given date (KST-agnostic, date string only). */
export function startOfWeekISO(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function getWeekDaysISO(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}

/** 시작일이 없으면 마감일과 동일하게 간주 (하루짜리) */
export function getTaskDateRange(task: Task): { start: string; end: string } | null {
  if (!task.due_date && !task.start_date) return null;
  const end = task.due_date ?? task.start_date ?? null;
  const start = task.start_date ?? task.due_date ?? null;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

/** 오늘 노출 규칙:
 * - 기간에 오늘이 포함되는 TODO
 * - 상태가 "진행중" (마감 무관)
 * - 완료/취소는 completed_at === today (Phase 3 후) — 지금은 updated_at 사용
 */
export function isTaskForToday(task: Task, today = todayISO()): boolean {
  const status = normalizeTaskStatus(task.status);
  if (status === "진행중") return true;
  if (status === "완료" || status === "취소") {
    const updated = task.updated_at?.slice(0, 10);
    return updated === today;
  }
  const range = getTaskDateRange(task);
  if (!range) return false;
  return range.start <= today && today <= range.end;
}

/** 주간 범위(월~일)와 겹치는 TODO인지 */
export function isTaskInWeek(task: Task, weekStart: string): boolean {
  const weekEnd = addDaysISO(weekStart, 6);
  const range = getTaskDateRange(task);
  if (!range) return false;
  return range.start <= weekEnd && range.end >= weekStart;
}

/** 기간형(= start_date와 due_date가 다른 날) 여부 */
export function isMultiDayTask(task: Task): boolean {
  const range = getTaskDateRange(task);
  if (!range) return false;
  return range.start !== range.end;
}

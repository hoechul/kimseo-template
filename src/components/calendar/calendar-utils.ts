import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
  subMonths,
  subWeeks,
  subDays,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  differenceInMinutes,
  startOfDay,
  setHours,
  setMinutes,
} from "date-fns";
import { ko } from "date-fns/locale";
import type { Schedule } from "@/lib/types";

export type ViewMode = "month" | "week" | "day";
const WEEK_STARTS_ON = 1;

export {
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  differenceInMinutes,
  startOfDay,
  setHours,
  setMinutes,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
};

export { ko };

export interface PositionedCalendarEvent {
  schedule: Schedule;
  top: number;
  height: number;
  column: number;
  columns: number;
}

export function getNormalizedScheduleRange(schedule: Schedule) {
  const start = parseISO(schedule.start_at);
  const end = parseISO(schedule.end_at);

  if (end >= start) {
    return { start, end };
  }

  return { start, end: start };
}

/** 월간 뷰용 6주(42일) 그리드 생성 */
export function getMonthGrid(date: Date): Date[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });

  const days: Date[] = [];
  let current = gridStart;
  while (current <= gridEnd) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

/** 주간 뷰용 7일 배열 */
export function getWeekDays(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** 시간 라벨 (0~23시) */
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function getPositionedCalendarEvents(
  schedules: Schedule[],
  hourHeight: number,
  minimumMinutes = 30
): PositionedCalendarEvent[] {
  type TimedItem = {
    schedule: Schedule;
    startMinutes: number;
    endMinutes: number;
    top: number;
    height: number;
    column: number;
  };

  const timedItems = schedules
    .map((schedule) => {
      const { start, end } = getNormalizedScheduleRange(schedule);
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = Math.max(
        end.getHours() * 60 + end.getMinutes(),
        startMinutes + minimumMinutes
      );
      const durationMinutes = Math.max(endMinutes - startMinutes, minimumMinutes);

      return {
        schedule,
        startMinutes,
        endMinutes,
        top: (startMinutes / 60) * hourHeight,
        height: (durationMinutes / 60) * hourHeight,
        column: 0,
      };
    })
    .sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
      if (a.endMinutes !== b.endMinutes) return a.endMinutes - b.endMinutes;
      return a.schedule.id.localeCompare(b.schedule.id);
    });

  const positioned: PositionedCalendarEvent[] = [];
  let cluster: TimedItem[] = [];
  let active: TimedItem[] = [];
  let clusterColumns = 0;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columns = Math.max(clusterColumns, 1);

    positioned.push(
      ...cluster.map((item) => ({
        schedule: item.schedule,
        top: item.top,
        height: item.height,
        column: item.column,
        columns,
      }))
    );

    cluster = [];
    active = [];
    clusterColumns = 0;
  };

  for (const item of timedItems) {
    active = active.filter((entry) => entry.endMinutes > item.startMinutes);

    if (active.length === 0) {
      flushCluster();
    }

    const usedColumns = new Set(active.map((entry) => entry.column));
    let column = 0;
    while (usedColumns.has(column)) column += 1;

    item.column = column;
    active.push(item);
    cluster.push(item);
    clusterColumns = Math.max(clusterColumns, active.length, column + 1);
  }

  flushCluster();

  return positioned;
}

/** 보이는 날짜 범위의 시작/끝 ISO 문자열 (Supabase 쿼리용) */
export function getVisibleRange(
  date: Date,
  viewMode: ViewMode
): { start: string; end: string } {
  if (viewMode === "month") {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });
    return {
      start: gridStart.toISOString(),
      end: addDays(gridEnd, 1).toISOString(),
    };
  }
  if (viewMode === "week") {
    const weekStart = startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON });
    return {
      start: weekStart.toISOString(),
      end: addDays(weekStart, 7).toISOString(),
    };
  }
  // day
  const dayStart = startOfDay(date);
  return {
    start: dayStart.toISOString(),
    end: addDays(dayStart, 1).toISOString(),
  };
}

/** 일정 유형 (DB 로드 전 기본값) */
export const DEFAULT_SCHEDULE_CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: "meeting", label: "미팅", color: "#3b82f6" },
  { value: "lecture", label: "강의", color: "#8b5cf6" },
  { value: "business_trip", label: "출장", color: "#f59e0b" },
  { value: "vacation", label: "휴가", color: "#22c55e" },
  { value: "deadline", label: "마감", color: "#ef4444" },
  { value: "other", label: "기타", color: "#6b7280" },
];

/** 하위호환용 별칭 */
export const SCHEDULE_CATEGORIES = DEFAULT_SCHEDULE_CATEGORIES;

/** DB에서 로드한 카테고리를 모듈 레벨에 저장 */
let _loadedCategories: { value: string; color: string }[] | null = null;

export function setLoadedCategories(categories: { value: string; color: string }[]) {
  _loadedCategories = categories;
}

export function getCategoryColor(
  category: string,
  categories?: { value: string; color: string }[]
): string {
  const list = categories ?? _loadedCategories ?? DEFAULT_SCHEDULE_CATEGORIES;
  return list.find((c) => c.value === category)?.color ?? "#6b7280";
}

/** 날짜+시간을 datetime-local input 포맷으로 */
export function toDateTimeLocal(isoString: string): string {
  if (!isoString) return "";
  const d = parseISO(isoString);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** 날짜만 date input 포맷으로 */
export function toDateInput(isoString: string): string {
  if (!isoString) return "";
  const d = parseISO(isoString);
  return format(d, "yyyy-MM-dd");
}

/**
 * hex 색상을 흰색과 혼합하여 불투명한 파스텔톤을 만든다.
 * ratio 0 = 흰색, 1 = 원색. 기본값 0.15 (약 15% 혼합).
 */
export function toPastel(hex: string, ratio = 0.15): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * ratio);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

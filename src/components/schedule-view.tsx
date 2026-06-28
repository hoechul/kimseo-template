"use client";

import Link from "next/link";
import { ExternalLink, Repeat, Video } from "lucide-react";
import type { Employee, Schedule, ScheduleCategoryItem } from "@/lib/types";
import { DEFAULT_SCHEDULE_CATEGORIES } from "@/components/calendar/calendar-utils";

interface ScheduleViewProps {
  schedule: Schedule;
  employees: Employee[];
  categories?: ScheduleCategoryItem[];
}

function formatDateTime(isoString: string, allDay: boolean): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  if (allDay) return date;
  return `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function getCategoryLabel(value: string, categories: { value: string; label: string }[]): string {
  return categories.find((category) => category.value === value)?.label ?? value;
}

export function ScheduleView({ schedule, employees, categories }: ScheduleViewProps) {
  const cats = categories && categories.length > 0 ? categories : DEFAULT_SCHEDULE_CATEGORIES;
  const category = cats.find((item) => item.value === schedule.category);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const attendeeNames =
    schedule.attendees
      ?.map((attendee) => employeeMap.get(attendee.employee_id)?.name)
      .filter(Boolean) ?? [];
  const locationUrl = schedule.location ? getExternalUrl(schedule.location) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ViewField label="시작" value={formatDateTime(schedule.start_at, schedule.all_day)} />
        <ViewField label="종료" value={formatDateTime(schedule.end_at, schedule.all_day)} />
      </div>

      {schedule.all_day && <ViewField label="종일" value="예" />}

      {schedule.recurrence_type && schedule.recurrence_type !== "none" && (
        <ViewField
          label="반복"
          value={
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" />
              {schedule.recurrence_type === "daily" && "매일"}
              {schedule.recurrence_type === "weekly" && "매주"}
              {schedule.recurrence_type === "monthly" && "매월"}
              {schedule.recurrence_end_date && ` (${schedule.recurrence_end_date}까지)`}
            </span>
          }
        />
      )}

      <ViewField
        label="유형"
        value={
          <span className="inline-flex items-center gap-1.5">
            {category && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: category.color }}
              />
            )}
            {getCategoryLabel(schedule.category, cats)}
          </span>
        }
      />

      <ViewField
        label="프로젝트"
        value={
          schedule.projects ? (
            <Link
              href={`/dashboard/projects/${schedule.projects.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              [{schedule.projects.project_number}] {schedule.projects.name}
            </Link>
          ) : (
            <span className="text-muted-foreground">프로젝트 없음</span>
          )
        }
      />

      <ViewField
        label="고객"
        value={
          schedule.customers ? (
            <Link
              href={`/dashboard/customers/${schedule.customers.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {schedule.customers.name}
            </Link>
          ) : (
            <span className="text-muted-foreground">고객 없음</span>
          )
        }
      />

      <ViewField
        label="리드"
        value={
          schedule.leads ? (
            <Link
              href={`/dashboard/leads/${schedule.leads.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {schedule.leads.company_name}
            </Link>
          ) : (
            <span className="text-muted-foreground">리드 없음</span>
          )
        }
      />

      {schedule.location && (
        <ViewField
          label="장소"
          value={
            locationUrl ? (
              <a
                href={locationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 break-all text-sm text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span>{schedule.location}</span>
              </a>
            ) : (
              schedule.location
            )
          }
        />
      )}

      {schedule.google_meet_link && (
        <ViewField
          label="Google Meet"
          value={
            <a
              href={schedule.google_meet_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              <Video className="h-4 w-4 shrink-0" />
              <span>회의 참여하기</span>
            </a>
          }
        />
      )}

      {attendeeNames.length > 0 && (
        <ViewField label="참석자" value={attendeeNames.join(", ")} />
      )}

      {schedule.description && (
        <ViewField
          label="메모"
          value={<span className="whitespace-pre-wrap">{schedule.description}</span>}
        />
      )}
    </div>
  );
}

function ViewField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

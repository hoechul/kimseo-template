"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Video } from "lucide-react";
import { formatKstDateLabel, formatKstTime } from "@/lib/date";
import type { Schedule } from "@/lib/types";

type ScheduleCategory = {
  value: string;
  label: string;
  color: string;
};

type DashboardScheduleListProps = {
  schedules: Schedule[];
  categories: ScheduleCategory[];
  showDate?: boolean;
};

const detailDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const detailTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function getCategoryMeta(category: string, categories: ScheduleCategory[]) {
  return categories.find((item) => item.value === category);
}

function formatDetailDateTime(isoString: string, allDay: boolean) {
  const date = detailDateFormatter.format(new Date(isoString));
  if (allDay) return date;
  return `${date} ${detailTimeFormatter.format(new Date(isoString))}`;
}

function ViewField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export function DashboardScheduleList({
  schedules,
  categories,
  showDate = false,
}: DashboardScheduleListProps) {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  const selectedCategory = useMemo(() => {
    if (!selectedSchedule) return null;
    return getCategoryMeta(selectedSchedule.category, categories) ?? null;
  }, [categories, selectedSchedule]);

  const attendeeNames = useMemo(() => {
    if (!selectedSchedule?.attendees) return [];
    return selectedSchedule.attendees
      .map((attendee) => attendee.employees?.name)
      .filter((name): name is string => Boolean(name));
  }, [selectedSchedule]);

  return (
    <>
      {schedules.map((schedule) => {
        const category = getCategoryMeta(schedule.category, categories);
        const color = category?.color ?? "#6b7280";
        const label = category?.label ?? schedule.category;

        return (
          <button
            key={schedule.id}
            type="button"
            onClick={() => setSelectedSchedule(schedule)}
            className="w-full min-w-0 rounded-[1.5rem] border border-border/70 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {label}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {showDate ? `${formatKstDateLabel(schedule.start_at)} ` : ""}
                  {schedule.all_day
                    ? "종일"
                    : `${formatKstTime(schedule.start_at)} - ${formatKstTime(schedule.end_at)}`}
                </span>
                <span className="min-w-0 truncate font-semibold text-foreground">{schedule.title}</span>
              </div>
              {(schedule.attendees?.length ?? 0) > 0 || schedule.location ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {schedule.attendees?.map((a) =>
                    a.employees?.name ? (
                      <span
                        key={a.id}
                        className="shrink-0 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-medium"
                      >
                        {a.employees.name}
                      </span>
                    ) : null
                  )}
                  {schedule.location ? (
                    <span className="min-w-0 break-all">{schedule.location}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </button>
        );
      })}

      <Dialog open={Boolean(selectedSchedule)} onOpenChange={(open) => !open && setSelectedSchedule(null)}>
        {selectedSchedule && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedCategory ? (
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: selectedCategory.color }}
                  />
                ) : null}
                <span className="min-w-0 truncate">{selectedSchedule.title}</span>
              </DialogTitle>
              <DialogDescription>대시보드에서 일정 상세 정보를 확인합니다.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ViewField
                  label="시작"
                  value={formatDetailDateTime(selectedSchedule.start_at, selectedSchedule.all_day)}
                />
                <ViewField
                  label="종료"
                  value={formatDetailDateTime(selectedSchedule.end_at, selectedSchedule.all_day)}
                />
              </div>

              {selectedSchedule.all_day ? <ViewField label="종일" value="예" /> : null}

              <ViewField
                label="유형"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {selectedCategory ? (
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedCategory.color }}
                      />
                    ) : null}
                    {selectedCategory?.label ?? selectedSchedule.category}
                  </span>
                }
              />

              {selectedSchedule.projects ? (
                <ViewField
                  label="프로젝트"
                  value={
                    <Link
                      href={`/dashboard/projects/${selectedSchedule.projects.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      [{selectedSchedule.projects.project_number}] {selectedSchedule.projects.name}
                    </Link>
                  }
                />
              ) : null}

              {selectedSchedule.location ? <ViewField label="장소" value={selectedSchedule.location} /> : null}
              {selectedSchedule.google_meet_link ? (
                <ViewField
                  label="Google Meet"
                  value={
                    <a
                      href={selectedSchedule.google_meet_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      <Video className="h-4 w-4 shrink-0" />
                      <span>회의 참여하기</span>
                    </a>
                  }
                />
              ) : null}
              {attendeeNames.length > 0 ? (
                <ViewField label="참석자" value={attendeeNames.join(", ")} />
              ) : null}
              {selectedSchedule.description ? (
                <ViewField
                  label="메모"
                  value={<span className="whitespace-pre-wrap">{selectedSchedule.description}</span>}
                />
              ) : null}
            </div>

            <DialogFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedSchedule(null)}>
                닫기
              </Button>
              <Button asChild>
                <Link href={`/dashboard/schedules?edit=${selectedSchedule.id}`}>
                  수정
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

"use client";

import { CalendarDays, CalendarRange, Columns3, List } from "lucide-react";

import type { TaskViewMode } from "@/lib/tasks/view-mode";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: { value: TaskViewMode; label: string; icon: typeof List }[] = [
  { value: "day", label: "오늘", icon: CalendarDays },
  { value: "week", label: "주간", icon: CalendarRange },
  { value: "kanban", label: "보드", icon: Columns3 },
  { value: "list", label: "목록", icon: List },
];

export function TasksViewTabs({
  view,
  onChange,
}: {
  view: TaskViewMode;
  onChange: (next: TaskViewMode) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-[1.25rem] border border-border/70 bg-background/70 p-1">
      {VIEW_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = view === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-[1rem] px-3.5 py-1.5 text-sm font-medium transition-all",
              isActive
                ? "bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(13,105,106,0.72)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-pressed={isActive}
          >
            <Icon className="size-4" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

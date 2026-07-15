"use client";

import { Search } from "lucide-react";

import { EmployeeFilter, type FilterMode } from "@/components/calendar/employee-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TASK_STATUS_TABS,
  type TaskDisplayStatus,
  type TaskStatusTab,
} from "@/lib/task-status";
import type { Employee } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TasksFilterBar({
  search,
  onSearchChange,
  statusFilters,
  statusCounts,
  onToggleStatusFilter,
  onClearStatusFilters,
  employees,
  filterMode,
  selectedEmployeeIds,
  totalTasksCount,
  unassignedCount,
  employeeTaskCounts,
  onFilterChange,
  hideDone,
  onToggleHideDone,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilters: Set<TaskDisplayStatus>;
  statusCounts: Record<TaskStatusTab, number>;
  onToggleStatusFilter: (status: TaskDisplayStatus) => void;
  onClearStatusFilters: () => void;
  employees: Employee[];
  filterMode: FilterMode;
  selectedEmployeeIds: string[];
  totalTasksCount: number;
  unassignedCount: number;
  employeeTaskCounts: Record<string, number>;
  onFilterChange: (mode: FilterMode, ids: string[]) => void;
  hideDone: boolean;
  onToggleHideDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="제목, 설명, 담당자, 우선순위 검색"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        {search ? (
          <Button variant="ghost" onClick={() => onSearchChange("")}>
            검색 초기화
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onToggleHideDone}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            hideDone
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/70 bg-background/70 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          )}
          aria-pressed={hideDone}
        >
          {hideDone ? "완료 숨김 ON" : "완료 숨김 OFF"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-[1.5rem] border border-border/70 bg-background/70 p-1">
          {TASK_STATUS_TABS.map((tab) => {
            const isAll = tab.value === "all";
            const isActive = isAll
              ? statusFilters.size === 0
              : statusFilters.has(tab.value as TaskDisplayStatus);
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() =>
                  isAll
                    ? onClearStatusFilters()
                    : onToggleStatusFilter(tab.value as TaskDisplayStatus)
                }
                className={cn(
                  "inline-flex min-w-fit items-center gap-2 rounded-[1.15rem] px-4 py-2 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(23,81,208,0.72)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs tabular-nums",
                    isActive
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {statusCounts[tab.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <EmployeeFilter
        employees={employees}
        filterMode={filterMode}
        selectedEmployeeIds={selectedEmployeeIds}
        schedulesCount={totalTasksCount}
        unassignedCount={unassignedCount}
        employeeScheduleCounts={employeeTaskCounts}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}

"use client";

import { Filter, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Employee } from "@/lib/types";

export type FilterMode = "all" | "unassigned" | "custom";

interface EmployeeFilterProps {
  employees: Employee[];
  filterMode: FilterMode;
  selectedEmployeeIds: string[];
  schedulesCount?: number;
  unassignedCount?: number;
  employeeScheduleCounts?: Record<string, number>;
  onFilterChange: (mode: FilterMode, ids: string[]) => void;
}

export function EmployeeFilter({
  employees,
  filterMode,
  selectedEmployeeIds,
  schedulesCount = 0,
  unassignedCount = 0,
  employeeScheduleCounts = {},
  onFilterChange,
}: EmployeeFilterProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const isEmployeeActive = (employeeId: string) =>
    filterMode === "custom" && selectedEmployeeIds.includes(employeeId);

  const handleToggle = (employeeId: string) => {
    if (filterMode !== "custom") {
      onFilterChange("custom", [employeeId]);
      return;
    }

    const exists = selectedEmployeeIds.includes(employeeId);
    const nextIds = exists
      ? selectedEmployeeIds.filter((id) => id !== employeeId)
      : [...selectedEmployeeIds, employeeId];

    if (nextIds.length === 0) {
      onFilterChange("all", employees.map((employee) => employee.id));
      return;
    }

    onFilterChange("custom", nextIds);
  };

  const sortedEmployees = [...employees].sort(
    (a, b) => (employeeScheduleCounts[b.id] ?? 0) - (employeeScheduleCounts[a.id] ?? 0)
  );

  const summaryLabel =
    filterMode === "all" ? "전체" : filterMode === "unassigned" ? "미배정" : `${selectedEmployeeIds.length}명 선택`;

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex min-w-fit items-center gap-2 rounded-[1.15rem] px-4 py-2 text-sm font-medium transition-all",
      active
        ? "bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(13,105,106,0.72)]"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  const mobileFilterContent = (
    <div className="space-y-5">
      <div className="space-y-2">
        <Button
          type="button"
          variant={filterMode === "all" ? "default" : "ghost"}
          className="h-10 w-full justify-start rounded-2xl"
          onClick={() => {
            onFilterChange("all", employees.map((employee) => employee.id));
            setMobileOpen(false);
          }}
        >
          <span>전체</span>
          <span className="ml-auto text-xs">{schedulesCount}</span>
        </Button>

        <Button
          type="button"
          variant={filterMode === "unassigned" ? "default" : "ghost"}
          className="h-10 w-full justify-start rounded-2xl"
          onClick={() => {
            onFilterChange("unassigned", []);
            setMobileOpen(false);
          }}
        >
          <span>미배정</span>
          <span className="ml-auto text-xs">{unassignedCount}</span>
        </Button>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Team
        </p>

        <div className="space-y-1.5">
          {sortedEmployees.map((employee) => {
            const active = isEmployeeActive(employee.id);

            return (
              <button
                key={employee.id}
                type="button"
                onClick={() => { handleToggle(employee.id); setMobileOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_12px_28px_-18px_rgba(13,105,106,0.72)]"
                    : "border-border/50 bg-background/65 hover:border-primary/10 hover:bg-background"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{employee.name}</span>
                  {employee.department ? (
                    <span
                      className={cn(
                        "block truncate text-xs",
                        active ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}
                    >
                      {employee.department}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    active
                      ? "border border-primary-foreground/20 bg-primary-foreground/15 text-primary-foreground"
                      : "border border-border/60 bg-background/80 text-muted-foreground"
                  )}
                >
                  {employeeScheduleCounts[employee.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: button to open modal */}
      <div className="md:hidden">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between rounded-2xl"
          onClick={() => setMobileOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" />
            담당자 필터
          </span>
          <span className="text-xs text-muted-foreground">{summaryLabel}</span>
        </Button>
      </div>

      {/* Desktop: horizontal tab bar */}
      <div className="hidden md:block overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-[1.5rem] border border-border/70 bg-background/70 p-1">
          <button
            type="button"
            onClick={() => onFilterChange("all", employees.map((e) => e.id))}
            className={tabClass(filterMode === "all")}
          >
            <span>전체</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs tabular-nums",
                filterMode === "all"
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {schedulesCount}
            </span>
          </button>

          {sortedEmployees.map((employee) => {
            const active = isEmployeeActive(employee.id);
            return (
              <button
                key={employee.id}
                type="button"
                onClick={() => handleToggle(employee.id)}
                className={tabClass(active)}
              >
                <span>{employee.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs tabular-nums",
                    active
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {employeeScheduleCounts[employee.id] ?? 0}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onFilterChange("unassigned", [])}
            className={tabClass(filterMode === "unassigned")}
          >
            <span>미배정</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs tabular-nums",
                filterMode === "unassigned"
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {unassignedCount}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile modal */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="p-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>담당자 필터</DialogTitle>
            <DialogDescription>담당자를 선택하여 일정을 필터링합니다.</DialogDescription>
          </DialogHeader>
          {mobileFilterContent}
        </DialogContent>
      </Dialog>
    </>
  );
}

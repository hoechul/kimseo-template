"use client";

import { useCallback, useEffect, useState } from "react";

import type { FilterMode } from "@/components/calendar/employee-filter";
import { TASK_STATUS_OPTIONS, type TaskDisplayStatus } from "@/lib/task-status";
import type { Employee } from "@/lib/types";

const STATUS_FILTERS_KEY = "dashboard.tasks.status-filters";
const HIDE_DONE_KEY = "dashboard.tasks.hide-done";

export function useTasksFilters() {
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<TaskDisplayStatus>>(() => new Set());
  const [statusFiltersReady, setStatusFiltersReady] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [assigneesInitialized, setAssigneesInitialized] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [hideDoneReady, setHideDoneReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STATUS_FILTERS_KEY);
      if (raw) {
        const parsed = raw
          .split(",")
          .map((item) => item.trim())
          .filter((item): item is TaskDisplayStatus =>
            (TASK_STATUS_OPTIONS as readonly string[]).includes(item)
          );
        if (parsed.length > 0) {
          setStatusFilters(new Set(parsed));
        }
      }
    } catch {
      // ignore
    }
    setStatusFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!statusFiltersReady) return;
    try {
      window.localStorage.setItem(
        STATUS_FILTERS_KEY,
        Array.from(statusFilters).join(",")
      );
    } catch {
      // ignore
    }
  }, [statusFilters, statusFiltersReady]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HIDE_DONE_KEY);
      if (raw === "1") setHideDone(true);
    } catch {
      // ignore
    }
    setHideDoneReady(true);
  }, []);

  useEffect(() => {
    if (!hideDoneReady) return;
    try {
      window.localStorage.setItem(HIDE_DONE_KEY, hideDone ? "1" : "0");
    } catch {
      // ignore
    }
  }, [hideDone, hideDoneReady]);

  const toggleHideDone = useCallback(() => setHideDone((v) => !v), []);

  const toggleStatusFilter = useCallback((status: TaskDisplayStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const clearStatusFilters = useCallback(() => {
    setStatusFilters(new Set());
  }, []);

  const handleFilterChange = useCallback((mode: FilterMode, ids: string[]) => {
    setFilterMode(mode);
    setSelectedEmployeeIds(ids);
  }, []);

  const applyInitialAssignees = useCallback(
    (currentEmployeeId: string | null, employees: Employee[]) => {
      if (assigneesInitialized) return;
      if (currentEmployeeId) {
        setFilterMode("custom");
        setSelectedEmployeeIds([currentEmployeeId]);
      } else {
        setFilterMode("all");
        setSelectedEmployeeIds(employees.map((employee) => employee.id));
      }
      setAssigneesInitialized(true);
    },
    [assigneesInitialized]
  );

  return {
    search,
    setSearch,
    statusFilters,
    toggleStatusFilter,
    clearStatusFilters,
    filterMode,
    selectedEmployeeIds,
    handleFilterChange,
    applyInitialAssignees,
    hideDone,
    toggleHideDone,
  };
}

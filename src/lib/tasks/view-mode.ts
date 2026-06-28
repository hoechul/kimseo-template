"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TaskViewMode = "day" | "week" | "kanban" | "list";

export const TASK_VIEW_MODES: TaskViewMode[] = ["day", "week", "kanban", "list"];

const DEFAULT_VIEW: TaskViewMode = "list";
const STORAGE_KEY = "dashboard.tasks.view";

function readStoredView(): TaskViewMode | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (TASK_VIEW_MODES as readonly string[]).includes(stored)) {
      return stored as TaskViewMode;
    }
  } catch {
    // ignore
  }
  return null;
}

export function useTaskViewMode() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams?.get("view");
  const view: TaskViewMode = (TASK_VIEW_MODES as readonly string[]).includes(raw ?? "")
    ? (raw as TaskViewMode)
    : DEFAULT_VIEW;

  // 진입 시 URL에 view 쿼리가 없으면 localStorage에 저장된 마지막 뷰로 복원
  useEffect(() => {
    if (raw) return;
    const stored = readStoredView();
    if (!stored || stored === DEFAULT_VIEW) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("view", stored);
    const qs = params.toString();
    const base = pathname ?? "";
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    // 첫 진입에만 복원 — 이후 사용자의 명시적 setView만 URL/localStorage를 변경
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = useCallback(
    (next: TaskViewMode) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === DEFAULT_VIEW) params.delete("view");
      else params.set("view", next);
      const qs = params.toString();
      const base = pathname ?? "";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { view, setView };
}

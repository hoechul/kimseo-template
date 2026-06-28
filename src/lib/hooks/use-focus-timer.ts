"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { notifyFocusComplete } from "@/lib/tasks/notifications";
import type { Task } from "@/lib/types";

export interface FocusTimerState {
  remainingSeconds: number;
  elapsedSeconds: number;
  totalSeconds: number;
  isExpired: boolean;
}

/** 현재 집중 중인 task를 받아 남은 초/경과 초를 1초마다 업데이트. */
export function useFocusTimer(task: Task | null): FocusTimerState | null {
  const [now, setNow] = useState(() => Date.now());
  const triggeredRef = useRef<string | null>(null);

  const state = useMemo<FocusTimerState | null>(() => {
    if (!task || !task.started_at || !task.estimated_minutes) return null;
    const total = task.estimated_minutes * 60;
    const startedMs = new Date(task.started_at).getTime();
    const elapsed = Math.max(0, Math.floor((now - startedMs) / 1000));
    const remaining = total - elapsed;
    return {
      remainingSeconds: remaining,
      elapsedSeconds: elapsed,
      totalSeconds: total,
      isExpired: remaining <= 0,
    };
  }, [task, now]);

  useEffect(() => {
    if (!task || !task.started_at || !task.estimated_minutes) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [task]);

  useEffect(() => {
    if (!task || !state) return;
    if (!state.isExpired) return;
    if (triggeredRef.current === task.id) return;
    triggeredRef.current = task.id;
    notifyFocusComplete(task.title);
  }, [state, task]);

  useEffect(() => {
    if (!task?.id) triggeredRef.current = null;
  }, [task?.id]);

  return state;
}

export function formatRemaining(totalSeconds: number): string {
  const absSec = Math.abs(totalSeconds);
  const sign = totalSeconds < 0 ? "+" : "";
  const minutes = Math.floor(absSec / 60);
  const seconds = absSec % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

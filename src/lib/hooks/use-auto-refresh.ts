"use client";

import { useEffect, useRef } from "react";

type Options = {
  intervalMs?: number;
  onFocus?: boolean;
  onVisibilityChange?: boolean;
  minGapMs?: number;
  enabled?: boolean;
};

export function useAutoRefresh(
  refetch: () => void | Promise<void>,
  opts: Options = {}
) {
  const {
    intervalMs = 60_000,
    onFocus = true,
    onVisibilityChange = true,
    minGapMs = 2_000,
    enabled = true,
  } = opts;

  const refetchRef = useRef(refetch);
  const lastRunAtRef = useRef(0);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const run = () => {
      const now = Date.now();
      if (now - lastRunAtRef.current < minGapMs) return;
      lastRunAtRef.current = now;
      void refetchRef.current();
    };

    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };

    const intervalId = window.setInterval(run, intervalMs);
    if (onFocus) window.addEventListener("focus", run);
    if (onVisibilityChange) document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(intervalId);
      if (onFocus) window.removeEventListener("focus", run);
      if (onVisibilityChange) document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs, onFocus, onVisibilityChange, minGapMs]);
}

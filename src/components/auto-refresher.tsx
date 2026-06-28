"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { useAutoRefresh } from "@/lib/hooks/use-auto-refresh";

type Props = {
  intervalMs?: number;
  enabled?: boolean;
};

export function AutoRefresher({ intervalMs = 60_000, enabled = true }: Props) {
  const router = useRouter();

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useAutoRefresh(refresh, { intervalMs, enabled });

  return null;
}

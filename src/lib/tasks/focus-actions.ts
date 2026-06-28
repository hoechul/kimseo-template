import type { SupabaseClient } from "@supabase/supabase-js";

import { sendLog } from "@/lib/log-client";

export async function startFocus(
  supabase: SupabaseClient,
  params: {
    employeeId: string;
    taskId: string;
    estimatedMinutes: number;
    startedAt?: string;
  }
) {
  const startedAt = params.startedAt ?? new Date().toISOString();
  const results = await Promise.all([
    supabase
      .from("tasks")
      .update({
        status: "진행중",
        started_at: startedAt,
        estimated_minutes: params.estimatedMinutes,
      })
      .eq("id", params.taskId),
    supabase
      .from("employees")
      .update({ focused_task_id: params.taskId })
      .eq("id", params.employeeId),
  ]);
  const first = results.find((r) => r.error);
  if (first?.error) return { ok: false, error: first.error.message } as const;

  sendLog("FOCUS_START", `집중 시작 (${params.estimatedMinutes}분)`, {
    resource: "task",
    resource_id: params.taskId,
  });
  return { ok: true, startedAt } as const;
}

export async function completeFocus(
  supabase: SupabaseClient,
  params: { employeeId: string; taskId: string; startedAt: string | null }
) {
  const completedAt = new Date().toISOString();
  const actualMinutes = params.startedAt
    ? Math.max(
        1,
        Math.ceil((Date.parse(completedAt) - Date.parse(params.startedAt)) / 60000)
      )
    : null;

  const results = await Promise.all([
    supabase
      .from("tasks")
      .update({
        status: "완료",
        completed_at: completedAt,
        actual_minutes: actualMinutes,
      })
      .eq("id", params.taskId),
    supabase
      .from("employees")
      .update({ focused_task_id: null })
      .eq("id", params.employeeId),
  ]);
  const first = results.find((r) => r.error);
  if (first?.error) return { ok: false, error: first.error.message } as const;

  sendLog("FOCUS_COMPLETE", `집중 완료 (${actualMinutes ?? "-"}분)`, {
    resource: "task",
    resource_id: params.taskId,
  });
  return { ok: true, actualMinutes } as const;
}

export async function stopFocus(
  supabase: SupabaseClient,
  params: { employeeId: string; taskId: string }
) {
  const results = await Promise.all([
    supabase
      .from("tasks")
      .update({ started_at: null })
      .eq("id", params.taskId),
    supabase
      .from("employees")
      .update({ focused_task_id: null })
      .eq("id", params.employeeId),
  ]);
  const first = results.find((r) => r.error);
  if (first?.error) return { ok: false, error: first.error.message } as const;

  sendLog("FOCUS_STOP", "집중 중단", {
    resource: "task",
    resource_id: params.taskId,
  });
  return { ok: true } as const;
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendLog } from "@/lib/log-client";
import type { Task } from "@/lib/types";

type BulkUpdatable = Pick<Task, "status" | "due_date" | "priority">;
export type BulkTaskPatch = Partial<BulkUpdatable>;

function describePatch(patch: BulkTaskPatch): string {
  const parts: string[] = [];
  if (patch.status !== undefined) parts.push(`status=${patch.status}`);
  if (patch.due_date !== undefined) parts.push(`due_date=${patch.due_date ?? "없음"}`);
  if (patch.priority !== undefined) parts.push(`priority=${patch.priority}`);
  return parts.join(", ");
}

export async function bulkUpdateTasks(
  supabase: SupabaseClient,
  ids: string[],
  patch: BulkTaskPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true };

  const { error } = await supabase.from("tasks").update(patch).in("id", ids);
  if (error) {
    return { ok: false, error: error.message };
  }

  sendLog("BULK_UPDATE_TASK", `할일 일괄 수정: ${ids.length}건 ${describePatch(patch)}`, {
    resource: "task",
    resource_id: ids.join(","),
  });

  return { ok: true };
}

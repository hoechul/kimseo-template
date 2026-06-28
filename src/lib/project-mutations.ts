import type { SupabaseClient } from "@supabase/supabase-js";

import { sendLog } from "@/lib/log-client";
import type { Project } from "@/lib/types";

type BulkUpdatable = Pick<Project, "status">;
export type BulkProjectPatch = Partial<BulkUpdatable>;

function describePatch(patch: BulkProjectPatch): string {
  const parts: string[] = [];
  if (patch.status !== undefined) parts.push(`status=${patch.status}`);
  return parts.join(", ");
}

export async function bulkUpdateProjects(
  supabase: SupabaseClient,
  ids: string[],
  patch: BulkProjectPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true };

  const { error } = await supabase.from("projects").update(patch).in("id", ids);
  if (error) {
    return { ok: false, error: error.message };
  }

  sendLog("BULK_UPDATE_PROJECT", `프로젝트 일괄 수정: ${ids.length}건 ${describePatch(patch)}`, {
    resource: "project",
    resource_id: ids.join(","),
  });

  return { ok: true };
}

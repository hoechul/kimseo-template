import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

interface LogOptions {
  resource?: string;
  resource_id?: string;
  actor_id?: string;
  actor_name?: string;
  details?: Record<string, unknown>;
}

async function getIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function resolveActor(authUid: string): Promise<{ id: string; name: string } | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("employees")
      .select("id, name")
      .eq("auth_uid", authUid)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

async function writeLog(
  level: "INFO" | "ERROR",
  action: string,
  message: string,
  opts?: LogOptions
) {
  try {
    const supabase = createAdminClient();
    const ip = await getIp();

    let actorId = opts?.actor_id ?? null;
    let actorName = opts?.actor_name ?? null;

    // If we have an auth_uid in actor_id but no name, resolve it
    if (actorId && !actorName) {
      const actor = await resolveActor(actorId);
      if (actor) {
        actorName = actor.name;
        actorId = actor.id;
      }
    }

    supabase
      .from("app_logs")
      .insert({
        level,
        action,
        message,
        resource: opts?.resource ?? null,
        resource_id: opts?.resource_id ?? null,
        actor_id: actorId,
        actor_name: actorName,
        ip_address: ip,
        details: opts?.details ?? null,
      })
      .then();
  } catch {
    // fire-and-forget: never throw
  }
}

export function logInfo(action: string, message: string, opts?: LogOptions) {
  writeLog("INFO", action, message, opts);
}

export function logError(action: string, message: string, opts?: LogOptions) {
  writeLog("ERROR", action, message, opts);
}

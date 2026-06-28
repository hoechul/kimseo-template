export interface AgentMemoryRecord {
  namespace: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export async function getAgentMemory(
  supabase: SupabaseClient,
  userAuthUid: string,
  namespace: string,
  key: string
): Promise<AgentMemoryRecord | null> {
  const { data, error } = await supabase
    .from("agent_memories")
    .select("namespace, key, value, updated_at")
    .eq("user_auth_uid", userAuthUid)
    .eq("namespace", namespace)
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return null;

  return {
    namespace: data.namespace,
    key: data.key,
    value: (data.value as Record<string, unknown>) ?? {},
    updated_at: data.updated_at,
  };
}

export async function setAgentMemory(
  supabase: SupabaseClient,
  userAuthUid: string,
  namespace: string,
  key: string,
  value: Record<string, unknown>
) {
  const { error } = await supabase
    .from("agent_memories")
    .upsert(
      {
        user_auth_uid: userAuthUid,
        namespace,
        key,
        value,
      },
      {
        onConflict: "user_auth_uid,namespace,key",
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function clearAgentMemory(
  supabase: SupabaseClient,
  userAuthUid: string,
  namespace: string,
  key: string
) {
  const { error } = await supabase
    .from("agent_memories")
    .delete()
    .eq("user_auth_uid", userAuthUid)
    .eq("namespace", namespace)
    .eq("key", key);

  if (error) {
    throw new Error(error.message);
  }
}

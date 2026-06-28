import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

const KEY_PREFIX = "ys_";
const KEY_LENGTH = 40;

export function generateApiKey(): string {
  const random = randomBytes(32).toString("hex");
  return (KEY_PREFIX + random).slice(0, KEY_LENGTH);
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function getKeyPrefix(key: string): string {
  return key.slice(0, 12) + "...";
}

function extractApiKey(request: NextRequest): string {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

/**
 * 요청에서 API Key를 추출하고 DB 해시 비교로 검증한다.
 * 유효하면 last_used_at을 갱신하고 true를 반환한다.
 * 환경변수 REVENUE_API_KEY fallback도 지원한다.
 */
export async function validateApiKey(request: NextRequest): Promise<boolean> {
  const key = extractApiKey(request);
  if (!key) return false;

  // 환경변수 fallback (하위 호환)
  const envKey = process.env.REVENUE_API_KEY;
  if (envKey && key === envKey) return true;

  // DB 기반 검증
  const hash = hashApiKey(key);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return false;

  // last_used_at 갱신 (fire-and-forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then();

  return true;
}

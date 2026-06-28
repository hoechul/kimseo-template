import { createAdminClient } from "@/lib/supabase/admin";

function normalizeSettingValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getSystemSettings(keys: string[]) {
  if (keys.length === 0) {
    return {} as Record<string, string | null>;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_settings")
    .select("key, value")
    .in("key", keys);

  if (error) {
    throw new Error(error.message);
  }

  const settings = Object.fromEntries(
    keys.map((key) => [key, null as string | null])
  ) as Record<string, string | null>;

  for (const row of data ?? []) {
    settings[row.key] = normalizeSettingValue(row.value);
  }

  return settings;
}

export async function getSystemSetting(key: string) {
  const settings = await getSystemSettings([key]);
  return settings[key] ?? null;
}

export async function getSystemSettingWithEnvFallback(
  key: string,
  envKey: string
) {
  return (
    (await getSystemSetting(key)) ??
    normalizeSettingValue(process.env[envKey])
  );
}

export async function getRequiredSystemSetting(
  key: string,
  envKey: string,
  message: string
) {
  const value = await getSystemSettingWithEnvFallback(key, envKey);
  if (!value) {
    throw new Error(message);
  }

  return value;
}

import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { getSystemSettings } from "@/lib/system-settings";

const BOLTA_SETTING_KEYS = [
  "bolta_api_key",
  "bolta_customer_key",
  "bolta_webhook_secret",
  "bolta_supplier_manager_email",
] as const;

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const settings = await getSystemSettings([...BOLTA_SETTING_KEYS]);

  return Response.json({
    api_key: settings.bolta_api_key ?? process.env.BOLTA_API_KEY ?? "",
    customer_key: settings.bolta_customer_key ?? process.env.BOLTA_CUSTOMER_KEY ?? "",
    webhook_secret:
      settings.bolta_webhook_secret ?? process.env.BOLTA_WEBHOOK_SECRET ?? "",
    supplier_manager_email:
      settings.bolta_supplier_manager_email ??
      process.env.BOLTA_SUPPLIER_MANAGER_EMAIL ??
      "",
  });
}

export async function PUT(request: Request) {
  const { supabase, user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }
  const body = await request.json();

  const values = {
    bolta_api_key: asTrimmedString(body.api_key),
    bolta_customer_key: asTrimmedString(body.customer_key),
    bolta_webhook_secret: asTrimmedString(body.webhook_secret),
    bolta_supplier_manager_email: asTrimmedString(body.supplier_manager_email),
  };

  const upsertRows = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));
  const deleteKeys = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("system_settings")
      .upsert(upsertRows, { onConflict: "key" });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  if (deleteKeys.length > 0) {
    const { error } = await supabase
      .from("system_settings")
      .delete()
      .in("key", deleteKeys);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ success: true });
}

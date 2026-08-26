import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONNECTOR_CATALOG } from "@/lib/trading-lab/connectors";
import { encryptConnectorSecret, getUserConnectorSecret } from "@/lib/trading-lab/connector-secrets";
import { testConnector } from "@/lib/trading-lab/connector-test";

async function authenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("trading_connector_profiles").select("id,provider,label,masked_secret,capabilities,status,is_primary,last_checked_at,last_success_at,last_error,updated_at").eq("user_id", user.id);
  if (error && !error.message.includes("trading_connector_profiles")) return NextResponse.json({ error: error.message }, { status: 500 });
  const profiles = data ?? [];
  return NextResponse.json({ connectors: CONNECTOR_CATALOG.map(definition => ({ ...definition, profile: profiles.find(item => item.provider === definition.id) ?? null })) });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await authenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const definition = CONNECTOR_CATALOG.find(item => item.id === body.provider);
    if (!definition) return NextResponse.json({ error: "Unsupported connector" }, { status: 400 });
    const admin = createAdminClient();

    if (body.action === "disable" || body.action === "enable") {
      const status = body.action === "disable" ? "disabled" : "connected";
      const { error } = await admin.from("trading_connector_profiles").update({ status, last_error: null }).eq("user_id", user.id).eq("provider", definition.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, status });
    }

    const supplied = typeof body.secret === "string" ? body.secret.trim() : "";
    const existing = supplied ? null : await getUserConnectorSecret(user.id, definition.id);
    const secret = definition.auth === "none" ? undefined : supplied || existing || undefined;
    if (definition.auth !== "none" && !secret) return NextResponse.json({ error: "Enter an API key or secret first." }, { status: 400 });
    const result = await testConnector(definition.id, secret);

    if (body.action === "test") return NextResponse.json(result);
    if (body.action !== "save") return NextResponse.json({ error: "Unknown connector action" }, { status: 400 });

    const masked = secret ? `${secret.slice(0, Math.min(3, secret.length))}••••${secret.slice(-4)}` : "No key required";
    const { data: profile, error: profileError } = await admin.from("trading_connector_profiles").upsert({
      user_id: user.id, provider: definition.id, label: definition.name,
      masked_secret: masked, capabilities: definition.capabilities, status: "connected",
      last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null,
    }, { onConflict: "user_id,provider" }).select("id").single();
    if (profileError) throw profileError;

    if (secret) {
      const encrypted = encryptConnectorSecret(secret);
      const { error: secretError } = await admin.from("trading_connector_secrets").upsert({
        connector_id: profile.id, user_id: user.id, ciphertext: encrypted.ciphertext,
        iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
        rotated_at: new Date().toISOString(),
      }, { onConflict: "connector_id" });
      if (secretError) throw secretError;
    }
    await admin.from("trading_connector_events").insert({ connector_id: profile.id, user_id: user.id, event_type: "connected", detail: { latency_ms: result.latencyMs } });
    return NextResponse.json({ ...result, masked });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connector operation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { user } = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("trading_connector_profiles").delete().eq("user_id", user.id).eq("provider", provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

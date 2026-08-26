import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

async function readVaultSecret(connectorId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_trading_connector_secret", { p_connector_id: connectorId, p_user_id: userId });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function getUserConnectorSecret(userId: string, provider: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("trading_connector_profiles").select("id,status").eq("user_id", userId).eq("provider", provider).maybeSingle();
  if (!profile || profile.status !== "connected") return null;
  return readVaultSecret(profile.id, userId);
}

export async function getConnectorSecretById(connectorId: string, provider: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("trading_connector_profiles").select("id,user_id,status,provider").eq("id", connectorId).eq("provider", provider).maybeSingle();
  if (!profile || profile.status !== "connected") return null;
  const secret = await readVaultSecret(profile.id, profile.user_id as string);
  return secret ? { secret, userId: profile.user_id as string } : null;
}

export async function storeConnectorSecret(connectorId: string, userId: string, secret: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("store_trading_connector_secret", { p_connector_id: connectorId, p_user_id: userId, p_secret: secret });
  if (error) throw error;
}

export async function deleteConnectorSecret(connectorId: string, userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("delete_trading_connector_secret", { p_connector_id: connectorId, p_user_id: userId });
  if (error) throw error;
}

const envFallbacks: Record<string, string> = { twelve_data: "TWELVE_DATA_API_KEY", fred: "FRED_API_KEY", databento: "DATABENTO_API_KEY", openai: "OPENAI_API_KEY" };

export async function resolveConnectorSecret(userId: string, provider: string) {
  try { const personal = await getUserConnectorSecret(userId, provider); if (personal) return personal; } catch { /* shared environment fallback during migration */ }
  const envName = envFallbacks[provider];
  return envName ? process.env[envName]?.trim() || null : null;
}

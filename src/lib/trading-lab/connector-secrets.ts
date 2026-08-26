import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type EncryptedSecret = { ciphertext: string; iv: string; authTag: string; keyVersion: number };

function encryptionKey() {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Connector encryption is not configured. Add CONNECTOR_ENCRYPTION_KEY to the server environment.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CONNECTOR_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64.");
  return key;
}

export function encryptConnectorSecret(secret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), keyVersion: 1 };
}

export function decryptConnectorSecret(secret: { ciphertext: string; iv: string; auth_tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export async function getUserConnectorSecret(userId: string, provider: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("trading_connector_profiles").select("id,status").eq("user_id", userId).eq("provider", provider).maybeSingle();
  if (!profile || profile.status !== "connected") return null;
  const { data: secret, error } = await admin.from("trading_connector_secrets").select("ciphertext,iv,auth_tag").eq("connector_id", profile.id).eq("user_id", userId).maybeSingle();
  if (error || !secret) return null;
  return decryptConnectorSecret(secret);
}

const envFallbacks: Record<string, string> = {
  twelve_data: "TWELVE_DATA_API_KEY",
  fred: "FRED_API_KEY",
  databento: "DATABENTO_API_KEY",
  openai: "OPENAI_API_KEY",
};

export async function resolveConnectorSecret(userId: string, provider: string) {
  try {
    const personal = await getUserConnectorSecret(userId, provider);
    if (personal) return personal;
  } catch {
    // Shared environment configuration remains a valid fallback during migration.
  }
  const envName = envFallbacks[provider];
  return envName ? process.env[envName]?.trim() || null : null;
}

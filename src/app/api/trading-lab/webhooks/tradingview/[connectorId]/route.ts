import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnectorSecretById } from "@/lib/trading-lab/connector-secrets";

export const runtime = "nodejs";

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(req: NextRequest, context: { params: Promise<{ connectorId: string }> }) {
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 64_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const { connectorId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(connectorId)) return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
    const raw = await req.text();
    if (raw.length > 64_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "TradingView message must be valid JSON" }, { status: 400 }); }
    const connector = await getConnectorSecretById(connectorId, "tradingview_webhook");
    if (!connector || typeof payload.secret !== "string" || !safeEqual(payload.secret, connector.secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const symbol = String(payload.symbol ?? payload.ticker ?? "").trim().slice(0, 40);
    if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    const cleanPayload = { ...payload }; delete cleanPayload.secret;
    const eventIdentity = String(payload.alert_id ?? payload.id ?? `${raw}:${Math.floor(Date.now() / 60_000)}`);
    const eventHash = createHash("sha256").update(`${connectorId}:${eventIdentity}`).digest("hex");
    const price = Number(payload.price ?? payload.close);
    const admin = createAdminClient();
    const { error } = await admin.from("tradingview_alerts").insert({ connector_id: connectorId, user_id: connector.userId, event_hash: eventHash, alert_name: typeof payload.alert_name === "string" ? payload.alert_name.slice(0, 120) : null, symbol, timeframe: typeof payload.timeframe === "string" ? payload.timeframe.slice(0, 30) : null, action: typeof payload.action === "string" ? payload.action.slice(0, 30) : null, price: Number.isFinite(price) ? price : null, payload: cleanPayload });
    if (error && error.code !== "23505") throw error;
    return NextResponse.json({ accepted: true, duplicate: error?.code === "23505" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tradeEventSchema } from "@/lib/trading-lab/lifecycle";
import { dbError, loadManualTrades, readAll } from "@/lib/trading-lab/manual-data";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const tradeId = req.nextUrl.searchParams.get("tradeId");
    if (tradeId) {
      if (!/^[0-9a-f-]{36}$/i.test(tradeId)) return NextResponse.json({ error: "Invalid trade ID" }, { status: 400 });
      const events = await readAll(supabase.from("trading_trade_events").select("*").eq("user_id", user.id).eq("trade_id", tradeId).order("expected_revision").order("id"));
      return NextResponse.json({ events });
    }
    const [trades, rules] = await Promise.all([
      loadManualTrades(supabase, user.id),
      readAll(supabase.from("rules").select("id,rule_text,domain").eq("user_id", user.id).eq("active", true).order("id")),
    ]);
    return NextResponse.json({ trades, rules });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = tradeEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the event fields.", issues: parsed.error.issues }, { status: 400 });
  const event = parsed.data;
  const { data, error } = await supabase.rpc("append_trading_event", { p_request_id: event.requestId, p_trade_id: event.tradeId, p_expected_revision: event.expectedRevision, p_kind: event.kind, p_payload: event.payload });
  if (error) { const result = dbError(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
  if (!data?.id || !data?.lifecycle_revision) return NextResponse.json({ error: "No complete trade receipt was returned." }, { status: 503 });
  return NextResponse.json({ trade: data });
}

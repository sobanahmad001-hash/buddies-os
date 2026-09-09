import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dbError } from "@/lib/trading-lab/manual-data";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLabSnapshot } from "@/lib/trading-lab/market-data";
import { runBacktest } from "@/lib/trading-lab/engine";
import { validateStrategyVersion } from "@/lib/trading-lab/strategy-schema";
import { LADDER_PRESETS, STRATEGY_TEMPLATES } from "@/lib/trading-lab/templates";

async function auth() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); return { supabase, user }; }

export async function GET() {
  const { supabase, user } = await auth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("trading_strategies").select("*,trading_strategy_versions(id,version,definition,change_note,created_at)").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Saved strategies could not be loaded." }, { status: 503 });
  return NextResponse.json({ strategies: data ?? [], templates: STRATEGY_TEMPLATES, ladderPresets: LADDER_PRESETS });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (body.action === "backtest") {
      let template: any = STRATEGY_TEMPLATES[body.templateId] ?? null;
      let customStrategy = false;
      if (body.strategyId) {
        const { data, error } = await supabase.from("trading_strategy_versions").select("definition,version").eq("user_id", user.id).eq("strategy_id", body.strategyId).order("version", { ascending: false }).limit(1).single();
        if (error) throw error;
        template = data.definition;
        customStrategy = true;
      }
      if (!template) template = STRATEGY_TEMPLATES.swing;
      const snapshot = await getLabSnapshot(user.id, body.symbol ?? "XAU/USD", true);
      const riskPct = Number(body.riskPct ?? template.sizing.value);
      const progressive = body.ladderPreset === "controlled" ? { multiplier: 1.5, maxIncreases: 2 } : undefined;
      const result = runBacktest(snapshot.candles, { initialCapital: Number(body.initialCapital ?? 1000), riskPct, stopAtr: Number(template.exit.stopValue ?? 1.5), rewardRisk: Number(template.exit.targetValue ?? 2), commission: Number(body.commission ?? template.execution?.commission ?? 0), slippage: Number(body.slippage ?? template.execution?.slippage ?? .1), entryMode: template.entryMode, strategy: customStrategy ? template : undefined, progressive });
      return NextResponse.json({ result, dataset: { source: snapshot.source, demo: snapshot.demo, symbol: snapshot.symbol, asOf: snapshot.asOf }, strategy: template });
    }
    if (body.action === "save") {
      const parsed = validateStrategyVersion(body.definition);
      if (!parsed.success) return NextResponse.json({ error: "Strategy rules are invalid", issues: parsed.error.issues }, { status: 400 });
      const requestId = body.requestId ?? randomUUID();
      if (!z.string().uuid().safeParse(requestId).success || (body.strategyId && !z.string().uuid().safeParse(body.strategyId).success)) return NextResponse.json({ error: "Invalid request or strategy ID" }, { status: 400 });
      const saved = await supabase.rpc("save_trading_strategy", { p_request_id: requestId, p_strategy_id: body.strategyId ?? null, p_definition: parsed.data, p_change_note: String(body.changeNote ?? "Approved strategy version").slice(0, 4000) });
      if (saved.error) { const e = dbError(saved.error); return NextResponse.json({ error: e.error }, { status: e.status }); }
      if (!saved.data?.strategy?.id || !saved.data?.version?.id) return NextResponse.json({ error: "No complete version receipt returned." }, { status: 503 });
      return NextResponse.json({ strategy: { ...saved.data.strategy, versions: [saved.data.version] }, version: saved.data.version });
    }
    return NextResponse.json({ error: "Unknown strategy action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Strategy operation failed" }, { status: 500 });
  }
}

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
  const { data } = await supabase.from("trading_strategies").select("*,trading_strategy_versions(id,version,definition,change_note,created_at)").eq("user_id", user.id).order("updated_at", { ascending: false });
  return NextResponse.json({ strategies: data ?? [], templates: STRATEGY_TEMPLATES, ladderPresets: LADDER_PRESETS });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await auth();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (body.action === "backtest") {
      const template = STRATEGY_TEMPLATES[body.templateId] ?? STRATEGY_TEMPLATES.swing;
      const snapshot = await getLabSnapshot(user.id, body.symbol ?? "XAU/USD", true);
      const riskPct = Number(body.riskPct ?? template.sizing.value);
      const progressive = body.ladderPreset === "controlled" ? { multiplier: 1.5, maxIncreases: 2 } : undefined;
      const result = runBacktest(snapshot.candles, { initialCapital: Number(body.initialCapital ?? 1000), riskPct, stopAtr: Number(template.exit.stopValue ?? 1.5), rewardRisk: Number(template.exit.targetValue ?? 2), commission: Number(body.commission ?? 0), slippage: Number(body.slippage ?? .1), entryMode: template.entryMode, progressive });
      return NextResponse.json({ result, dataset: { source: snapshot.source, demo: snapshot.demo, symbol: snapshot.symbol, asOf: snapshot.asOf }, strategy: template });
    }
    if (body.action === "save") {
      const parsed = validateStrategyVersion(body.definition);
      if (!parsed.success) return NextResponse.json({ error: "Strategy rules are invalid", issues: parsed.error.issues }, { status: 400 });
      const { data: strategy, error } = await supabase.from("trading_strategies").insert({ user_id: user.id, name: parsed.data.name, description: parsed.data.description, market: parsed.data.market }).select().single();
      if (error) throw error;
      const { data: version, error: versionError } = await supabase.from("trading_strategy_versions").insert({ strategy_id: strategy.id, user_id: user.id, version: 1, definition: parsed.data, change_note: "Initial version" }).select().single();
      if (versionError) { await supabase.from("trading_strategies").delete().eq("id", strategy.id).eq("user_id", user.id); throw versionError; }
      return NextResponse.json({ strategy: { ...strategy, versions: [version] } });
    }
    return NextResponse.json({ error: "Unknown strategy action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Strategy operation failed" }, { status: 500 });
  }
}

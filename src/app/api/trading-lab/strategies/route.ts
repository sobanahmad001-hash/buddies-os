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
      let strategy: any;
      let nextVersion = 1;
      if (body.strategyId) {
        const { data, error } = await supabase.from("trading_strategies").update({ name: parsed.data.name, description: parsed.data.description, market: parsed.data.market, updated_at: new Date().toISOString() }).eq("id", body.strategyId).eq("user_id", user.id).select().single();
        if (error) throw error;
        strategy = data;
        const { data: latest } = await supabase.from("trading_strategy_versions").select("version").eq("strategy_id", strategy.id).eq("user_id", user.id).order("version", { ascending: false }).limit(1).maybeSingle();
        nextVersion = Number(latest?.version ?? 0) + 1;
      } else {
        const created = await supabase.from("trading_strategies").insert({ user_id: user.id, name: parsed.data.name, description: parsed.data.description, market: parsed.data.market }).select().single();
        if (created.error) throw created.error;
        strategy = created.data;
      }
      const { data: version, error: versionError } = await supabase.from("trading_strategy_versions").insert({ strategy_id: strategy.id, user_id: user.id, version: nextVersion, definition: parsed.data, change_note: body.changeNote ?? (nextVersion === 1 ? "Initial version" : "Revised in Strategy Builder") }).select().single();
      if (versionError) { if (nextVersion === 1) await supabase.from("trading_strategies").delete().eq("id", strategy.id).eq("user_id", user.id); throw versionError; }
      return NextResponse.json({ strategy: { ...strategy, versions: [version] } });
    }
    return NextResponse.json({ error: "Unknown strategy action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Strategy operation failed" }, { status: 500 });
  }
}

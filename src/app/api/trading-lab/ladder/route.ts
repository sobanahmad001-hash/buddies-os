import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { simulateLadder } from "@/lib/trading-lab/ladder";
import { LADDER_PRESETS } from "@/lib/trading-lab/templates";

export async function GET() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("trading_ladder_campaigns").select("*,trading_ladder_campaign_steps(*)").eq("user_id", user.id).order("updated_at", { ascending: false });
  return NextResponse.json({ campaigns: data ?? [], presets: LADDER_PRESETS });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (body.action === "simulate") {
      const preset = LADDER_PRESETS[body.presetId as keyof typeof LADDER_PRESETS] ?? LADDER_PRESETS.steady;
      return NextResponse.json({ result: simulateLadder(body.trades ?? [], { startingBalance: Number(body.startingBalance ?? 100), stepCount: preset.stepCount, targetGrowthPct: preset.targetGrowthPct, maxAttemptsPerStep: preset.maxAttemptsPerStep, failureDrawdownPct: preset.failureDrawdownPct }), preset });
    }
    if (body.action === "create") {
      const preset = LADDER_PRESETS[body.presetId as keyof typeof LADDER_PRESETS] ?? LADDER_PRESETS.steady; const startingBalance = Number(body.startingBalance ?? 100);
      const { data: campaign, error } = await supabase.from("trading_ladder_campaigns").insert({ user_id: user.id, strategy_id: body.strategyId ?? null, name: body.name ?? preset.name, mode: body.mode ?? "paper", status: "active", starting_balance: startingBalance, current_balance: startingBalance, current_step: 1, step_count: preset.stepCount, config: preset, started_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      const steps = Array.from({ length: preset.stepCount }, (_, index) => ({ campaign_id: campaign.id, user_id: user.id, step_number: index + 1, start_balance: startingBalance * (1 + preset.targetGrowthPct / 100) ** index, target_balance: startingBalance * (1 + preset.targetGrowthPct / 100) ** (index + 1), status: index === 0 ? "active" : "pending", started_at: index === 0 ? new Date().toISOString() : null }));
      const saved = await supabase.from("trading_ladder_campaign_steps").insert(steps).select(); if (saved.error) throw saved.error;
      return NextResponse.json({ campaign: { ...campaign, steps: saved.data } });
    }
    return NextResponse.json({ error: "Unknown ladder action" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ladder operation failed" }, { status: 500 }); }
}

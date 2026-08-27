import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLabSnapshot } from "@/lib/trading-lab/market-data";
import { resolveAISelection } from "@/lib/ai/config";
import { callAIProvider, describeAIError } from "@/lib/ai/providers";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json(); const snapshot = await getLabSnapshot(user.id, body.symbol ?? "XAU/USD", true, body.interval);
    let narrative = `${snapshot.decision.state}. ${snapshot.decision.trigger}. Invalidation: ${snapshot.decision.invalidation}.`;
    let provider = null, model = null; let aiWarning: ReturnType<typeof describeAIError> | null = null;
    try {
      const selection = resolveAISelection({ provider: body.provider, model: body.model, workload: "decision" });
      const ai = await callAIProvider({ ...selection, maxTokens: 650,
        system: "You explain a deterministic trading-research decision. Preserve the supplied state exactly. Use only supplied evidence. Clearly separate facts, missing data, trigger and invalidation. Never tell the user to execute a trade and never invent prices, events, volume or citations.",
        messages: [{ role: "user", content: `Explain this server snapshot concisely:\n${JSON.stringify({ symbol: snapshot.symbol, interval: snapshot.interval, asOf: snapshot.asOf, dataQuality: snapshot.dataQuality, fundamental: snapshot.fundamental, technical: snapshot.technical, volumeWyckoff: snapshot.volume, structure: snapshot.structure, decision: snapshot.decision })}` }],
      }); narrative = ai.text; provider = ai.provider; model = ai.model;
    } catch (error) { aiWarning = describeAIError(error); }
    let decisionId = null;
    if (!snapshot.demo) {
      const saved = await supabase.from("trading_decisions").insert({ user_id: user.id, instrument: snapshot.symbol, decision_state: snapshot.decision.state, bias: snapshot.decision.bias, confidence: snapshot.decision.confidence, data_quality: snapshot.dataQuality, fundamental: snapshot.fundamental, technical: snapshot.technical, volume_wyckoff: snapshot.volume, market_snapshot: { currentPrice: snapshot.currentPrice, source: snapshot.source, structure: snapshot.structure, target: snapshot.decision.target, rewardRisk: snapshot.decision.rewardRisk }, trigger_text: String(snapshot.decision.trigger), invalidation_text: String(snapshot.decision.invalidation), blockers: snapshot.decision.blockers, sources: [{ name: snapshot.source }], narrative, provider, model, as_of: new Date(snapshot.asOf).toISOString() }).select("id").single();
      if (!saved.error) decisionId = saved.data.id;
    }
    return NextResponse.json({ snapshot, narrative, decisionId, ai: { operational: !aiWarning, provider, model, error: aiWarning } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Decision failed" }, { status: 500 }); }
}

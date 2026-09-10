import { researchMarketNews } from "@/lib/trading-lab/live-news";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLabSnapshot } from "@/lib/trading-lab/market-data";
import { resolveAISelection } from "@/lib/ai/config";
import { callAIProvider, describeAIError } from "@/lib/ai/providers";

export const maxDuration = 120;
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (body.includeNews === true && String(body.symbol ?? "XAU/USD").replace(/[^a-z]/gi, "").toUpperCase() !== "XAUUSD") return NextResponse.json({error:"News alignment currently supports XAU/USD."},{status:400});
    const snapshot = await getLabSnapshot(user.id, body.symbol ?? "XAU/USD", true, body.interval);
    const news = body.includeNews === true ? await researchMarketNews(req,snapshot) : null;
    let narrative = `${snapshot.decision.state}. ${snapshot.decision.trigger}. Invalidation: ${snapshot.decision.invalidation}.`;
    let provider = null, model = null; let aiWarning: ReturnType<typeof describeAIError> | null = null;
    if (!news) try {
      const selection = resolveAISelection({ provider: body.provider, model: body.model, workload: "decision" });
      const ai = await callAIProvider({ ...selection, maxTokens: 650,
        system: "You explain a deterministic trading-research decision. Preserve the supplied state exactly. Use only supplied evidence. Clearly separate facts, missing data, trigger and invalidation. Never tell the user to execute a trade and never invent prices, events, volume or citations.",
        messages: [{ role: "user", content: `Explain this server snapshot concisely:\n${JSON.stringify({ symbol: snapshot.symbol, interval: snapshot.interval, asOf: snapshot.asOf, dataQuality: snapshot.dataQuality, fundamental: { ...snapshot.fundamental, news }, technical: snapshot.technical, volumeWyckoff: snapshot.volume, structure: snapshot.structure, decision: snapshot.decision })}` }],
      }); narrative = ai.text; provider = ai.provider; model = ai.model;
    } catch (error) { aiWarning = describeAIError(error); }
    if (news?.status === "available") { narrative = news.reply!; provider = "openai"; model = "gpt-4.1"; }
    if (news?.status === "unavailable") narrative = `${narrative} Current news unavailable; no news alignment was inferred.`;
    let decisionId = null;
    let persistenceWarning:string|null = null;
    if (!snapshot.demo) {
      const saved = await supabase.from("trading_decisions").insert({ user_id: user.id, instrument: snapshot.symbol, decision_state: snapshot.decision.state, bias: snapshot.decision.bias, confidence: snapshot.decision.confidence, data_quality: snapshot.dataQuality, fundamental: { ...snapshot.fundamental, news }, technical: snapshot.technical, volume_wyckoff: snapshot.volume, market_snapshot: { analysisVersion: "market-evidence-v2", interval: snapshot.interval, capturedAt: new Date().toISOString(), candles: snapshot.candles, currentPrice: snapshot.currentPrice, source: snapshot.source, structure: snapshot.structure, target: snapshot.decision.target, rewardRisk: snapshot.decision.rewardRisk }, trigger_text: String(snapshot.decision.trigger), invalidation_text: String(snapshot.decision.invalidation), blockers: snapshot.decision.blockers, sources: [{ name: snapshot.source }, ...(news?.citations??[])], narrative, provider, model, as_of: new Date(snapshot.asOf).toISOString() }).select("id").single();
      if (!saved.error) decisionId = saved.data.id;
      else persistenceWarning = "Analysis is displayed but its decision record was not saved.";
    }
    return NextResponse.json({ snapshot, narrative, news, decisionId, persistenceWarning, ai: { operational: news ? news.status === "available" : !aiWarning, provider, model, error: aiWarning } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Decision failed" }, { status: 500 }); }
}

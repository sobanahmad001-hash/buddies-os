import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAISelection } from "@/lib/ai/config";
import { callAIProvider } from "@/lib/ai/providers";
import { STRATEGY_TEMPLATES } from "@/lib/trading-lab/templates";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const selection = resolveAISelection({ provider: body.provider, model: body.model, workload: "analysis" });
    const response = await callAIProvider({ ...selection, maxTokens: 900,
      system: "You are the Buddies OS Strategy Copilot. Help translate trading ideas into measurable rules and critique backtest evidence. Never claim to have run a test unless results are supplied. Call vague ideas out explicitly. Doubling and ladders are risk overlays, not market edges. Keep risk warnings concrete and concise.",
      messages: [{ role: "user", content: `User request: ${String(body.prompt ?? "").slice(0, 4000)}\n\nAvailable templates:\n${JSON.stringify(Object.fromEntries(Object.entries(STRATEGY_TEMPLATES).map(([key, value]) => [key, { name: value.name, description: value.description, timeframes: value.timeframes, entry: value.entry, exit: value.exit, sizing: value.sizing }]))) }\n\nBacktest result if supplied:\n${JSON.stringify(body.backtest ?? null)}` }],
    });
    return NextResponse.json({ content: response.text, provider: response.provider, model: response.model });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Copilot failed" }, { status: 500 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAISelection } from "@/lib/ai/config";
import { callAIProvider, describeAIError } from "@/lib/ai/providers";
import { STRATEGY_TEMPLATES } from "@/lib/trading-lab/templates";
import { validateStrategyVersion } from "@/lib/trading-lab/strategy-schema";

function extractDraft(text: string) {
  const match = text.match(/<strategy_draft>([\s\S]*?)<\/strategy_draft>/i);
  if (!match) return null;
  try {
    const candidate = JSON.parse(match[1]);
    const parsed = validateStrategyVersion(candidate);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const selection = resolveAISelection({ provider: body.provider, model: body.model, workload: "analysis" });
    const response = await callAIProvider({ ...selection, maxTokens: 1800,
      system: `You are the Buddies OS Strategy Builder. Help a manual trader turn an idea into measurable, testable rules. Never instruct the user to buy, sell, or act urgently. Ask concise clarifying questions when words such as strong, near, confirmation, or support are not quantified. Doubling and ladders are risk overlays, never market edges.

When the idea is sufficiently measurable, explain the rules in plain language and append exactly one valid JSON object wrapped in <strategy_draft>...</strategy_draft>. Use schemaVersion 1 and the same shape as the supplied examples. A strategy with direction "both" must contain separate longEntry and shortEntry condition groups; never reuse one ambiguous entry group for both directions. A long-only or short-only strategy uses entry. Supported backtest operands are close, open, high, low, ema_N, rsi_N, rolling_high_N, rolling_low_N, nearest_support, nearest_resistance, distance_to_support_atr, distance_to_resistance_atr, and structure_hit_rate. Use only gt, gte, lt, lte, eq, crosses_above, crosses_below, or between. A structural touch alone is never an entry; require measurable completed-candle confirmation. Otherwise ask a question and do not emit a draft. The user must approve before anything is saved.`,
      messages: [{ role: "user", content: `Conversation:\n${JSON.stringify((body.messages ?? []).slice(-8))}\n\nLatest request: ${String(body.prompt ?? "").slice(0, 4000)}\n\nValid examples:\n${JSON.stringify(STRATEGY_TEMPLATES)}\n\nBacktest result if supplied:\n${JSON.stringify(body.backtest ?? null)}` }],
    });
    const draft = extractDraft(response.text);
    const content = response.text.replace(/<strategy_draft>[\s\S]*?<\/strategy_draft>/i, "").trim();
    return NextResponse.json({ content, draft, provider: response.provider, model: response.model });
  } catch (error) { const detail = describeAIError(error); return NextResponse.json({ error: `${detail.type}: ${detail.message}`, errorType: detail.type, upstreamStatus: detail.status }, { status: detail.status && detail.status >= 400 && detail.status < 500 ? detail.status : 502 }); }
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, history } = await req.json();

  const [
    { data: ladder },
    { data: entries },
    { data: withdrawals },
    { data: goldCache },
  ] = await Promise.all([
    supabase.from("trading_ladder").select("*").eq("user_id", user.id).order("step_number"),
    supabase.from("trading_entries").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("trading_withdrawals").select("*").eq("user_id", user.id).order("withdrawn_at", { ascending: false }).limit(10),
    supabase.from("gold_price_cache").select("price_usd, fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const activeStep = (ladder ?? []).find((s: any) => s.status === "active");
  const completedSteps = (ladder ?? []).filter((s: any) => s.status === "completed").length;
  const totalWithdrawn = (withdrawals ?? []).reduce((s: number, w: any) => s + parseFloat(w.amount_usd ?? 0), 0);
  const openTrades = (entries ?? []).filter((e: any) => e.status === "open");
  const closedTrades = (entries ?? []).filter((e: any) => e.status === "closed");
  const totalPnl = closedTrades.reduce((s: number, e: any) => s + parseFloat(e.result_usd ?? 0), 0);

  const systemPrompt = `You are a trading assistant for the Gold Doubling Ladder strategy on XAU/USD.

STRATEGY RULES:
- Start with $10, double each step: $10 → $20 → $40 → $80 → $160 → ... → $1M+
- Every week: withdraw 50% of profits, reinvest 50%
- Instrument: Gold (XAU/USD)
- Brokers available: Exness, IC Markets
- This is Phase 1 — suggestion mode only. No automatic execution.

CURRENT LADDER STATE:
- Steps completed: ${completedSteps}/20
- Active step: ${activeStep ? `Step ${activeStep.step_number} (target: $${activeStep.target_amount})` : "none"}
- Gold price: ${goldCache ? `$${goldCache.price_usd} (as of ${new Date(goldCache.fetched_at).toLocaleTimeString()})` : "unknown"}
- Open trades: ${openTrades.length}
- Total closed trades: ${closedTrades.length}
- Total P&L: $${totalPnl.toFixed(2)}
- Total withdrawn: $${totalWithdrawn.toFixed(2)}

RECENT TRADES:
${closedTrades.slice(0, 5).map((e: any) => `- Step ${e.ladder_step} | ${e.direction?.toUpperCase()} ${e.instrument} | Entry: ${e.entry_price} → Exit: ${e.exit_price} | Result: $${e.result_usd}`).join("\n") || "No closed trades yet"}

OPEN TRADES:
${openTrades.map((e: any) => `- Step ${e.ladder_step} | ${e.direction?.toUpperCase()} ${e.instrument} @ ${e.entry_price} | Opened: ${new Date(e.opened_at).toLocaleDateString()}`).join("\n") || "No open trades"}

WITHDRAWAL HISTORY:
${(withdrawals ?? []).slice(0, 5).map((w: any) => `- Step ${w.ladder_step}: withdrew $${w.amount_usd} on ${new Date(w.withdrawn_at).toLocaleDateString()}`).join("\n") || "No withdrawals yet"}

YOUR ROLE:
- Surface signals and analysis for the user to act on
- Track ladder progress, suggest when to advance steps
- Flag when 50% withdrawal rule should trigger based on profit logged
- Analyze trade win rate, drawdown, and execution quality
- NEVER claim to have executed a trade — always say "you should" or "consider"
- Be direct and number-driven. No generic trading advice.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      ...(history ?? []).slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ],
  });

  const reply = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  return NextResponse.json({ reply });
}

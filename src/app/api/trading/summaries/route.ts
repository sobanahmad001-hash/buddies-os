import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("trading_summaries")
    .select("*")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ summaries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, period = "manual" } = body;

  if (action !== "generate") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Determine date range
  const now = new Date();
  const periodStart = new Date(now);
  if (period === "daily") {
    periodStart.setDate(now.getDate() - 1);
  } else if (period === "weekly") {
    periodStart.setDate(now.getDate() - 7);
  } else {
    periodStart.setDate(now.getDate() - 30);
  }

  // Load trade data for the period
  const [{ data: entries }, { data: ladder }] = await Promise.all([
    supabase
      .from("trading_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", periodStart.toISOString())
      .order("created_at"),
    supabase
      .from("trading_ladder")
      .select("*")
      .eq("user_id", user.id)
      .order("step_number"),
  ]);

  const closed = (entries ?? []).filter((e: any) => e.status === "closed");
  const open = (entries ?? []).filter((e: any) => e.status === "open");

  if (closed.length === 0 && open.length === 0) {
    return NextResponse.json(
      { error: "No trading data in the selected period. Log some trades first." },
      { status: 400 }
    );
  }

  const wins = closed.filter((e: any) => parseFloat(e.result_usd ?? 0) > 0);
  const losses = closed.filter((e: any) => parseFloat(e.result_usd ?? 0) < 0);
  const totalPnl = closed.reduce((s: number, e: any) => s + parseFloat(e.result_usd ?? 0), 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s: number, e: any) => s + parseFloat(e.result_usd), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s: number, e: any) => s + parseFloat(e.result_usd), 0) / losses.length) : 0;
  const expectancy = avgWin * (winRate / 100) - avgLoss * (1 - winRate / 100);

  const withChecklist = (entries ?? []).filter((e: any) => e.checklist_passed != null);
  const ruleAdherence = withChecklist.length > 0
    ? Math.round((withChecklist.filter((e: any) => e.checklist_passed).length / withChecklist.length) * 100)
    : null;

  const activeStep = (ladder ?? []).find((s: any) => s.status === "active");
  const completedSteps = (ladder ?? []).filter((s: any) => s.status === "completed").length;

  const statsSnapshot = {
    period,
    period_start: periodStart.toISOString(),
    period_end: now.toISOString(),
    total_trades: closed.length + open.length,
    closed_trades: closed.length,
    open_trades: open.length,
    wins: wins.length,
    losses: losses.length,
    win_rate: winRate,
    total_pnl: totalPnl,
    avg_win: avgWin,
    avg_loss: avgLoss,
    expectancy,
    rule_adherence: ruleAdherence,
    active_step: activeStep?.step_number ?? 1,
    completed_steps: completedSteps,
  };

  // Build trade context (last 20 closed trades)
  const tradeContext = closed.slice(-20).map((e: any) =>
    `- ${e.direction.toUpperCase()} ${e.instrument} | P&L: $${parseFloat(e.result_usd ?? 0).toFixed(2)} | Checklist: ${e.checklist_passed === true ? "✓ passed" : e.checklist_passed === false ? "✗ failed" : "not recorded"} | Notes: ${e.notes || "none"}`
  ).join("\n");

  const periodLabel = period === "daily" ? "yesterday" : period === "weekly" ? "this week" : "the past month";
  const nextLabel = period === "daily" ? "Tomorrow" : period === "weekly" ? "Next Week" : "Going Forward";

  const prompt = `You are a professional trading coach for a disciplined Gold Doubling Ladder trader. Analyze their performance for ${periodLabel} and provide specific, actionable coaching.

## TRADING STATS (${periodLabel})
- Trades taken: ${closed.length + open.length} (${closed.length} closed, ${open.length} open)
- Win rate: ${winRate}% (${wins.length}W / ${losses.length}L)
- Total P&L: $${totalPnl.toFixed(2)}
- Avg winning trade: $${avgWin.toFixed(2)}
- Avg losing trade: -$${avgLoss.toFixed(2)}
- Expectancy per trade: $${expectancy.toFixed(2)}
- Rule adherence (checklist): ${ruleAdherence !== null ? `${ruleAdherence}%` : "not tracked yet"}
- Gold Ladder: Step ${activeStep?.step_number ?? 1}/20, ${completedSteps} steps completed

## INDIVIDUAL TRADES
${tradeContext || "No closed trades in this period."}

## COACHING REPORT
Provide concise coaching in these 4 sections (use **bold** headers):

**Performance Summary** — 3 sentences max, include key numbers

**Mistakes & Patterns** — max 4 bullet points, be specific to the data above

**Strengths** — max 3 bullet points

**${nextLabel}: Focus Points** — 2-3 specific, actionable items

End with one motivational sentence referencing their Gold Ladder progress toward $5M.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 700,
    temperature: 0.65,
  });

  const content = completion.choices[0]?.message?.content ?? "";

  const { data: stored, error } = await supabase
    .from("trading_summaries")
    .insert({
      user_id: user.id,
      period_type: period,
      period_start: periodStart.toISOString().split("T")[0],
      period_end: now.toISOString().split("T")[0],
      content,
      stats_snapshot: statsSnapshot,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ summary: stored });
}

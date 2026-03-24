import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

async function fetchGoldPrice(supabase: any): Promise<number | null> {
  // Check cache first — use if under 15 min old
  const { data: cached } = await supabase
    .from("gold_price_cache")
    .select("price_usd, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 15 * 60 * 1000) return parseFloat(cached.price_usd);
  }

  // Fetch fresh — using metals-api or fallback to a free endpoint
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) {
        await supabase.from("gold_price_cache").insert({ price_usd: price, source: "yahoo" });
        return price;
      }
    }
  } catch {}
  return cached ? parseFloat(cached.price_usd) : null;
}

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    { data: ladder },
    { data: entries },
    { data: withdrawals },
    goldPrice,
  ] = await Promise.all([
    supabase.from("trading_ladder").select("*").eq("user_id", user.id).order("step_number"),
    supabase.from("trading_entries").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("trading_withdrawals").select("*").eq("user_id", user.id).order("withdrawn_at", { ascending: false }),
    fetchGoldPrice(supabase),
  ]);

  // Compute stats
  const activeStep = (ladder ?? []).find((s: any) => s.status === "active");
  const completedSteps = (ladder ?? []).filter((s: any) => s.status === "completed").length;
  const totalWithdrawn = (withdrawals ?? []).reduce((s: number, w: any) => s + parseFloat(w.amount_usd ?? 0), 0);
  const closedEntries = (entries ?? []).filter((e: any) => e.status === "closed");
  const totalPnl = closedEntries.reduce((s: number, e: any) => s + parseFloat(e.result_usd ?? 0), 0);
  const winRate = closedEntries.length > 0
    ? Math.round((closedEntries.filter((e: any) => parseFloat(e.result_usd ?? 0) > 0).length / closedEntries.length) * 100)
    : null;

  // Extended performance metrics
  const winsArr = closedEntries.filter((e: any) => parseFloat(e.result_usd ?? 0) > 0);
  const lossesArr = closedEntries.filter((e: any) => parseFloat(e.result_usd ?? 0) < 0);
  const avgWin = winsArr.length > 0 ? winsArr.reduce((s: number, e: any) => s + parseFloat(e.result_usd), 0) / winsArr.length : 0;
  const avgLoss = lossesArr.length > 0 ? Math.abs(lossesArr.reduce((s: number, e: any) => s + parseFloat(e.result_usd), 0) / lossesArr.length) : 0;
  const winRateDecimal = closedEntries.length > 0 ? winsArr.length / closedEntries.length : 0;
  const expectancy = closedEntries.length > 0
    ? Math.round((avgWin * winRateDecimal - avgLoss * (1 - winRateDecimal)) * 100) / 100
    : null;

  const sortedClosed = [...closedEntries].sort((a: any, b: any) =>
    new Date(a.closed_at || a.opened_at).getTime() - new Date(b.closed_at || b.opened_at).getTime()
  );
  let runningEq = 0, eqPeak = 0, maxDrawdownUsd = 0;
  for (const e of sortedClosed) {
    runningEq += parseFloat(e.result_usd ?? 0);
    if (runningEq > eqPeak) eqPeak = runningEq;
    const dd = eqPeak - runningEq;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;
  }

  const rEntries = closedEntries.filter((e: any) => e.r_multiple != null);
  const avgRMultiple = rEntries.length > 0
    ? Math.round((rEntries.reduce((s: number, e: any) => s + parseFloat(e.r_multiple), 0) / rEntries.length) * 100) / 100
    : null;

  const allEntries = entries ?? [];
  const withChecklist = allEntries.filter((e: any) => e.checklist_passed != null);
  const ruleAdherence = withChecklist.length > 0
    ? Math.round((withChecklist.filter((e: any) => e.checklist_passed).length / withChecklist.length) * 100)
    : null;

  return NextResponse.json({
    ladder: ladder ?? [],
    entries: entries ?? [],
    withdrawals: withdrawals ?? [],
    gold_price: goldPrice,
    stats: {
      active_step: activeStep ?? null,
      completed_steps: completedSteps,
      total_withdrawn_usd: totalWithdrawn,
      total_pnl_usd: totalPnl,
      win_rate: winRate,
      total_trades: closedEntries.length,
      expectancy,
      avg_r_multiple: avgRMultiple,
      max_drawdown_usd: Math.round(maxDrawdownUsd * 100) / 100,
      rule_adherence: ruleAdherence,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "log_trade") {
    const { data, error } = await supabase.from("trading_entries").insert({
      user_id: user.id, ...body.trade
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  }

  if (action === "close_trade") {
    const { data, error } = await supabase.from("trading_entries")
      .update({ exit_price: body.exit_price, result_usd: body.result_usd, result_pips: body.result_pips, status: "closed", closed_at: new Date().toISOString() })
      .eq("id", body.id).eq("user_id", user.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
  }

  if (action === "log_withdrawal") {
    const { data, error } = await supabase.from("trading_withdrawals").insert({
      user_id: user.id, ...body.withdrawal
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ withdrawal: data });
  }

  if (action === "advance_step") {
    // Mark current step complete, activate next
    await supabase.from("trading_ladder")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("step_number", body.current_step);
    await supabase.from("trading_ladder")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("step_number", body.current_step + 1);
    return NextResponse.json({ advanced: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

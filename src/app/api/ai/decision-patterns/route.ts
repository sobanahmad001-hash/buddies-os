import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Load all decisions with cognitive context
  const { data: decisions } = await supabase
    .from("decisions")
    .select("id, context, verdict, probability, outcome_rating, actual_outcome_bool, prediction_accuracy, cognitive_score_at_decision, stress_at_decision, sleep_at_decision, confidence_at_decision, impulse_at_decision, created_at, closed_at, type")
    .eq("user_id", user.id);

  const all = decisions ?? [];
  const closed = all.filter(d => d.actual_outcome_bool !== null);

  // ── Stress bands ──────────────────────────────────────────────────────────
  const stressBands: Record<string, { total: number; success: number }> = { low: { total: 0, success: 0 }, medium: { total: 0, success: 0 }, high: { total: 0, success: 0 } };
  closed.forEach(d => {
    const s = d.stress_at_decision ?? 5;
    const band = s <= 5 ? "low" : s <= 7 ? "medium" : "high";
    stressBands[band].total++;
    if (d.actual_outcome_bool) stressBands[band].success++;
  });

  // ── Cognitive bands ───────────────────────────────────────────────────────
  const cogBands: Record<string, { total: number; success: number }> = { high: { total: 0, success: 0 }, medium: { total: 0, success: 0 }, low: { total: 0, success: 0 } };
  closed.forEach(d => {
    const c = d.cognitive_score_at_decision ?? 50;
    const band = c >= 70 ? "high" : c >= 50 ? "medium" : "low";
    cogBands[band].total++;
    if (d.actual_outcome_bool) cogBands[band].success++;
  });

  // ── Probability calibration ───────────────────────────────────────────────
  const probBands: Record<string, { total: number; success: number }> = { "0-40": { total: 0, success: 0 }, "40-60": { total: 0, success: 0 }, "60-80": { total: 0, success: 0 }, "80-100": { total: 0, success: 0 } };
  closed.forEach(d => {
    const p = d.probability ?? 50;
    const band = p < 40 ? "0-40" : p < 60 ? "40-60" : p < 80 ? "60-80" : "80-100";
    probBands[band].total++;
    if (d.actual_outcome_bool) probBands[band].success++;
  });

  // ── Overall stats ─────────────────────────────────────────────────────────
  const totalClosed = closed.length;
  const totalSuccess = closed.filter(d => d.actual_outcome_bool).length;
  const overallRate = totalClosed > 0 ? Math.round((totalSuccess / totalClosed) * 100) : null;

  // ── Best decision state ───────────────────────────────────────────────────
  const successDecisions = closed.filter(d => d.actual_outcome_bool);
  const avgSuccessSleep = successDecisions.filter(d => d.sleep_at_decision).reduce((s, d) => s + (d.sleep_at_decision ?? 0), 0) / (successDecisions.filter(d => d.sleep_at_decision).length || 1);
  const avgSuccessStress = successDecisions.filter(d => d.stress_at_decision).reduce((s, d) => s + (d.stress_at_decision ?? 0), 0) / (successDecisions.filter(d => d.stress_at_decision).length || 1);
  const avgSuccessCognitive = successDecisions.filter(d => d.cognitive_score_at_decision).reduce((s, d) => s + (d.cognitive_score_at_decision ?? 0), 0) / (successDecisions.filter(d => d.cognitive_score_at_decision).length || 1);

  // ── AI Calibration insight ────────────────────────────────────────────────
  let calibrationInsight = null;
  if (closed.length >= 3) {
    const highProbBand = probBands["80-100"];
    if (highProbBand.total >= 2) {
      const actualRate = Math.round((highProbBand.success / highProbBand.total) * 100);
      if (actualRate < 70) {
        calibrationInsight = `Overconfidence detected: You predict 80–100% on ${highProbBand.total} decisions but succeed ${actualRate}% of the time.`;
      }
    }
    const lowProbBand = probBands["0-40"];
    if (lowProbBand.total >= 2) {
      const actualRate = Math.round((lowProbBand.success / lowProbBand.total) * 100);
      if (actualRate > 50) {
        calibrationInsight = `Underconfidence detected: You predict under 40% but succeed ${actualRate}% of the time on those decisions.`;
      }
    }
  }

  return NextResponse.json({
    totalDecisions: all.length,
    closedDecisions: totalClosed,
    overallSuccessRate: overallRate,
    stressBands,
    cognitiveBands: cogBands,
    probabilityBands: probBands,
    bestState: {
      avgSleep: Math.round(avgSuccessSleep * 10) / 10,
      avgStress: Math.round(avgSuccessStress * 10) / 10,
      avgCognitive: Math.round(avgSuccessCognitive),
    },
    calibrationInsight,
    openDecisions: all.filter(d => d.actual_outcome_bool === null).length,
  });
}

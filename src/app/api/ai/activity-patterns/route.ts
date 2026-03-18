import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function avg(nums: number[]): number | null {
  const valid = nums.filter((n) => n != null && !isNaN(n));
  if (!valid.length) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function correlate(xs: number[], ys: number[]): number | null {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x != null && y != null && !isNaN(x) && !isNaN(y));
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
  const num = pairs.reduce((s, [x, y]) => s + (x - meanX) * (y - meanY), 0);
  const den = Math.sqrt(
    pairs.reduce((s, [x]) => s + (x - meanX) ** 2, 0) *
    pairs.reduce((s, [, y]) => s + (y - meanY) ** 2, 0)
  );
  if (den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

function classifyExecutionPace(updateCount: number, taskCount: number, decisionCount: number) {
  const score = updateCount * 1.2 + taskCount * 0.8 + decisionCount * 0.6;
  if (score >= 18) return "high";
  if (score >= 8) return "steady";
  if (score >= 3) return "light";
  return "low";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const since7 = daysAgoIso(7);
    const since30 = daysAgoIso(30);

    const [
      { data: projects },
      { data: updates },
      { data: tasks },
      { data: decisions },
      { data: sessionMemory },
      { data: behaviorLogs },
      { data: decisionOutcomes },
    ] = await Promise.all([
      supabase.from("projects").select("id, name, status").eq("user_id", user.id).eq("status", "active"),
      supabase.from("project_updates").select("project_id, update_type, content, created_at, projects(name)").eq("user_id", user.id).gte("created_at", since7).order("created_at", { ascending: false }),
      supabase.from("project_tasks").select("project_id, title, status, updated_at, created_at").eq("user_id", user.id).or(`updated_at.gte.${since7},created_at.gte.${since7}`),
      supabase.from("decisions").select("project_id, context, verdict, created_at").eq("user_id", user.id).gte("created_at", since7),
      supabase.from("ai_session_memory").select("active_project, current_focus, key_topics, updated_at").eq("user_id", user.id).gte("updated_at", since7).order("updated_at", { ascending: false }).limit(10),
      // 30-day window for behavior patterns — need more data points for correlation
      supabase.from("behavior_logs").select("sleep_hours, stress, confidence, impulse, mood_tag, cognitive_score, timestamp").eq("user_id", user.id).gte("timestamp", since30).order("timestamp", { ascending: false }).limit(60),
      // Decisions with outcomes for correlation analysis
      supabase.from("decisions").select("stress_at_decision, sleep_at_decision, cognitive_score_at_decision, confidence_at_decision, outcome_rating, verdict, created_at").eq("user_id", user.id).gte("created_at", since30).not("outcome_rating", "is", null),
    ]);

    // ── Activity patterns (7-day) ──────────────────────────────────────────────
    const touchedProjects = [...new Set([
      ...(updates ?? []).map((u: any) => u.projects?.name).filter(Boolean),
      ...(tasks ?? []).map((t: any) => t.project_id).filter(Boolean),
      ...(decisions ?? []).map((d: any) => d.project_id).filter(Boolean),
    ])];

    const blockerCount = (updates ?? []).filter((u: any) => u.update_type?.toLowerCase() === "blocker").length;
    const sessionFocuses = [...new Set([
      ...(sessionMemory ?? []).map((m: any) => m.current_focus).filter(Boolean),
      ...(sessionMemory ?? []).map((m: any) => m.active_project).filter(Boolean),
    ])];

    const executionPace = classifyExecutionPace((updates ?? []).length, (tasks ?? []).length, (decisions ?? []).length);
    const blockerPressure = blockerCount >= 5 ? "high" : blockerCount >= 2 ? "medium" : "low";
    const decisionTempo = (decisions ?? []).length >= 6 ? "high" : (decisions ?? []).length >= 2 ? "moderate" : "low";
    const strongestFocus = sessionFocuses[0] || touchedProjects[0] || (projects ?? [])[0]?.name || null;

    let suggestedNextMove = "Review cross-project priorities and identify the highest-leverage next action.";
    if (blockerPressure === "high") suggestedNextMove = "Run a blocker-clearing pass first.";
    else if (executionPace === "low") suggestedNextMove = "Rebuild momentum with one sharply defined next action.";
    else if (touchedProjects.length >= 4) suggestedNextMove = "Reduce spread. Pick one or two projects to push decisively.";
    else if (decisionTempo === "high") suggestedNextMove = "Stabilize recent decisions and convert them into concrete work.";

    // ── Behavior correlation (30-day) ─────────────────────────────────────────
    const logs = behaviorLogs ?? [];
    const sleepVsCognitive = correlate(
      logs.map((l: any) => parseFloat(l.sleep_hours)),
      logs.map((l: any) => l.cognitive_score)
    );
    const stressVsCognitive = correlate(
      logs.map((l: any) => l.stress),
      logs.map((l: any) => l.cognitive_score)
    );
    const confidenceVsCognitive = correlate(
      logs.map((l: any) => l.confidence),
      logs.map((l: any) => l.cognitive_score)
    );

    const avgSleep7 = avg(logs.slice(0, 7).map((l: any) => parseFloat(l.sleep_hours)));
    const avgStress7 = avg(logs.slice(0, 7).map((l: any) => l.stress));
    const avgCognitive7 = avg(logs.slice(0, 7).map((l: any) => l.cognitive_score));
    const avgSleep30 = avg(logs.map((l: any) => parseFloat(l.sleep_hours)));
    const avgStress30 = avg(logs.map((l: any) => l.stress));
    const avgCognitive30 = avg(logs.map((l: any) => l.cognitive_score));

    const outcomes = decisionOutcomes ?? [];
    const successRate = outcomes.length > 0
      ? Math.round((outcomes.filter((d: any) => d.outcome_rating === "success").length / outcomes.length) * 100)
      : null;

    const highSleepDecisions = outcomes.filter((d: any) => parseFloat(d.sleep_at_decision) >= 7);
    const lowSleepDecisions = outcomes.filter((d: any) => parseFloat(d.sleep_at_decision) < 7 && d.sleep_at_decision != null);
    const highCogDecisions = outcomes.filter((d: any) => d.cognitive_score_at_decision >= 70);
    const lowCogDecisions = outcomes.filter((d: any) => d.cognitive_score_at_decision < 70 && d.cognitive_score_at_decision != null);

    const successRateHighSleep = highSleepDecisions.length > 0
      ? Math.round((highSleepDecisions.filter((d: any) => d.outcome_rating === "success").length / highSleepDecisions.length) * 100)
      : null;
    const successRateLowSleep = lowSleepDecisions.length > 0
      ? Math.round((lowSleepDecisions.filter((d: any) => d.outcome_rating === "success").length / lowSleepDecisions.length) * 100)
      : null;
    const successRateHighCog = highCogDecisions.length > 0
      ? Math.round((highCogDecisions.filter((d: any) => d.outcome_rating === "success").length / highCogDecisions.length) * 100)
      : null;
    const successRateLowCog = lowCogDecisions.length > 0
      ? Math.round((lowCogDecisions.filter((d: any) => d.outcome_rating === "success").length / lowCogDecisions.length) * 100)
      : null;

    const patternInsights: string[] = [];
    if (sleepVsCognitive !== null && Math.abs(sleepVsCognitive) > 0.3) {
      patternInsights.push(sleepVsCognitive > 0
        ? `Sleep strongly correlates with cognitive score (r=${sleepVsCognitive}). More sleep = sharper thinking.`
        : `Sleep and cognitive score are inversely correlated (r=${sleepVsCognitive}). Investigate timing or quality.`);
    }
    if (stressVsCognitive !== null && Math.abs(stressVsCognitive) > 0.3) {
      patternInsights.push(stressVsCognitive < 0
        ? `High stress is dragging cognitive score down (r=${stressVsCognitive}). Stress management has direct performance impact.`
        : `Stress and cognitive score are positively correlated — may indicate productive pressure.`);
    }
    if (successRateHighSleep !== null && successRateLowSleep !== null) {
      const diff = successRateHighSleep - successRateLowSleep;
      if (Math.abs(diff) >= 10) {
        patternInsights.push(`Decision success rate is ${diff > 0 ? `${diff}% higher` : `${Math.abs(diff)}% lower`} on 7+ hours sleep (${successRateHighSleep}% vs ${successRateLowSleep}%).`);
      }
    }
    if (successRateHighCog !== null && successRateLowCog !== null) {
      const diff = successRateHighCog - successRateLowCog;
      if (Math.abs(diff) >= 10) {
        patternInsights.push(`High cognitive score days show ${diff > 0 ? `${diff}% better` : `${Math.abs(diff)}% worse`} decision outcomes (${successRateHighCog}% vs ${successRateLowCog}%).`);
      }
    }
    if (logs.length < 5) {
      patternInsights.push("Not enough behavior logs yet for strong pattern detection. Log daily for 2 weeks to unlock correlations.");
    }

    // ── Write to user_metrics ─────────────────────────────────────────────────
    try {
      await supabase.from("user_metrics").upsert({
        user_id: user.id,
        avg_sleep_7d: avgSleep7,
        avg_stress_7d: avgStress7,
        avg_cognitive_7d: avgCognitive7,
        avg_sleep_30d: avgSleep30,
        avg_stress_30d: avgStress30,
        avg_cognitive_30d: avgCognitive30,
        overall_success_rate: successRate,
        high_cog_success_rate: successRateHighCog,
        low_cog_success_rate: successRateLowCog,
        computed_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      window_days: 7,
      active_projects: (projects ?? []).map((p: any) => p.name),
      touched_projects: touchedProjects,
      stats: {
        updates: (updates ?? []).length,
        blockers: blockerCount,
        tasks_changed: (tasks ?? []).length,
        decisions: (decisions ?? []).length,
      },
      execution_pace: executionPace,
      blocker_pressure: blockerPressure,
      decision_tempo: decisionTempo,
      strongest_focus: strongestFocus,
      suggested_next_move: suggestedNextMove,
      summary: `Over the last 7 days, operating pace was ${executionPace}. ${(updates ?? []).length} updates, ${(tasks ?? []).length} task changes, ${(decisions ?? []).length} decisions recorded.${strongestFocus ? ` Primary focus: ${strongestFocus}.` : ""}`,
      // ── New: behavior intelligence ──────────────────────────────────────────
      behavior: {
        log_count_30d: logs.length,
        avg_sleep_7d: avgSleep7,
        avg_stress_7d: avgStress7,
        avg_cognitive_7d: avgCognitive7,
        avg_sleep_30d: avgSleep30,
        avg_stress_30d: avgStress30,
        avg_cognitive_30d: avgCognitive30,
        correlations: {
          sleep_vs_cognitive: sleepVsCognitive,
          stress_vs_cognitive: stressVsCognitive,
          confidence_vs_cognitive: confidenceVsCognitive,
        },
        decision_outcomes: {
          total_with_outcomes: outcomes.length,
          overall_success_rate: successRate,
          success_rate_high_sleep: successRateHighSleep,
          success_rate_low_sleep: successRateLowSleep,
          success_rate_high_cog: successRateHighCog,
          success_rate_low_cog: successRateLowCog,
        },
        pattern_insights: patternInsights,
      },
    });
  } catch (error: any) {
    console.error("Activity patterns error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// ── Cognitive Score Formula ──────────────────────────────────────────────────
function calcCognitiveScore(log: any): number {
  const sleep = log.sleep_hours ?? 7;
  const stress = log.stress ?? 5;
  const confidence = log.confidence ?? 5;
  const impulse = log.impulse ?? 5;

  const sleepFactor = Math.min(sleep / 8, 1) * 30;           // max 30
  const confidenceFactor = (confidence / 10) * 25;           // max 25
  const stressPenalty = (stress / 10) * 30;                  // max -30
  const impulsePenalty = (impulse / 10) * 15;                // max -15

  // Mood modifier
  const moodBoost: Record<string, number> = {
    calm: 8, focused: 10, overconfident: -5,
    anxious: -8, fearful: -10, angry: -10,
    frustrated: -6, rushed: -4, bored: -2, exhausted: -8
  };
  const moodMod = moodBoost[log.mood_tag ?? "calm"] ?? 0;

  const raw = 50 + sleepFactor + confidenceFactor - stressPenalty - impulsePenalty + moodMod;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // ── Load all data ──────────────────────────────────────────────────────────
  const [{ data: logs }, { data: updates }, { data: decisions }, { data: projects }, { data: violations }] = await Promise.all([
    supabase.from("behavior_logs").select("id, mood_tag, stress, sleep_hours, confidence, impulse, cognitive_score, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(60),
    supabase.from("project_updates").select("project_id, update_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("decisions").select("id, context, verdict, probability, outcome_rating, prediction_accuracy, created_at, closed_at").eq("user_id", user.id),
    supabase.from("projects").select("id, name, updated_at, status").eq("user_id", user.id).eq("status", "active"),
    supabase.from("rule_violations").select("timestamp").eq("user_id", user.id).gte("timestamp", new Date(Date.now() - 30*86400000).toISOString()),
  ]);

  if (!logs || logs.length < 2) return NextResponse.json({ generated: 0, reason: "Need at least 2 behavior logs" });

  // ── Step 1: Calculate & store cognitive scores ─────────────────────────────
  const logsWithoutScore = (logs ?? []).filter(l => l.cognitive_score === null || l.cognitive_score === undefined);
  for (const log of logsWithoutScore) {
    const score = calcCognitiveScore(log);
    await supabase.from("behavior_logs").update({ cognitive_score: score }).eq("id", log.id);
    log.cognitive_score = score;
  }

  // ── Step 2: Pre-compute analytics metrics ─────────────────────────────────
  const allLogs = logs ?? [];
  const avgSleep = allLogs.filter(l => l.sleep_hours).reduce((s, l) => s + l.sleep_hours, 0) / (allLogs.filter(l => l.sleep_hours).length || 1);
  const avgStress = allLogs.filter(l => l.stress).reduce((s, l) => s + l.stress, 0) / (allLogs.filter(l => l.stress).length || 1);
  const avgCognitive = allLogs.filter(l => l.cognitive_score).reduce((s, l) => s + l.cognitive_score, 0) / (allLogs.filter(l => l.cognitive_score).length || 1);

  // Sleep < 6h → mood correlation
  const lowSleepLogs = allLogs.filter(l => l.sleep_hours && l.sleep_hours < 6);
  const lowSleepNegMood = lowSleepLogs.filter(l => ["anxious","frustrated","angry","fearful","exhausted"].includes(l.mood_tag ?? "")).length;
  const sleepMoodCorr = lowSleepLogs.length > 0 ? lowSleepNegMood / lowSleepLogs.length : 0;

  // High stress → decision outcomes
  const closedDecisions = (decisions ?? []).filter(d => d.outcome_rating && d.outcome_rating !== "pending" && d.probability);
  const avgAccuracy = closedDecisions.length ? closedDecisions.reduce((s, d) => s + (d.prediction_accuracy ?? 0), 0) / closedDecisions.length : null;

  // Project activity (7 days)
  const sevenAgo = new Date(Date.now() - 7*86400000).toISOString();
  const projFreq: Record<string, number> = {};
  (updates ?? []).filter(u => u.created_at >= sevenAgo).forEach(u => { projFreq[u.project_id] = (projFreq[u.project_id] ?? 0) + 1; });
  const stalledProjects = (projects ?? []).filter(p => !projFreq[p.id] || projFreq[p.id] === 0);

  // High impulse logs
  const highImpulseLogs = allLogs.filter(l => (l.impulse ?? 0) >= 7);
  const recentHighImpulse = highImpulseLogs.filter(l => new Date(l.timestamp) > new Date(Date.now() - 3*86400000)).length;

  // ── Step 3: Generate predictions ──────────────────────────────────────────
  const predictions = [];
  const latestLogs = allLogs.slice(0, 5);
  const recentAvgStress = latestLogs.reduce((s, l) => s + (l.stress ?? 5), 0) / (latestLogs.length || 1);
  const recentAvgCognitive = latestLogs.filter(l => l.cognitive_score).reduce((s, l) => s + l.cognitive_score, 0) / (latestLogs.filter(l => l.cognitive_score).length || 1);

  if (recentAvgStress >= 7) {
    predictions.push({ prediction_type: "stress_elevated", predicted_outcome: "Stress is running high — decision quality risk elevated", confidence: Math.min(0.95, recentAvgStress / 10), based_on_records: latestLogs.length });
  }
  if (recentHighImpulse >= 2) {
    predictions.push({ prediction_type: "decision_quality_risk", predicted_outcome: "High impulse detected across last 3 days — avoid high-stakes decisions", confidence: 0.72, based_on_records: recentHighImpulse });
  }
  if (recentAvgCognitive < 45) {
    predictions.push({ prediction_type: "low_cognitive_state", predicted_outcome: "Cognitive score below threshold — creative and strategic work may suffer", confidence: 0.78, based_on_records: latestLogs.length });
  }
  if (stalledProjects.length >= 2) {
    predictions.push({ prediction_type: "project_stall_risk", predicted_outcome: `${stalledProjects.length} projects with no updates this week — momentum loss likely`, confidence: 0.65, based_on_records: stalledProjects.length });
  }

  // Clear old predictions, write fresh
  await supabase.from("predictions").delete().eq("user_id", user.id);
  for (const pred of predictions) {
    await supabase.from("predictions").insert({
      user_id: user.id,
      ...pred,
      is_active: true,
      expires_at: new Date(Date.now() + 24*60*60*1000).toISOString(),
    });
  }

  // ── Step 4: AI generates depth insights ───────────────────────────────────
  const dataBlock = `
BEHAVIOR SUMMARY (${allLogs.length} logs):
avg_sleep: ${avgSleep.toFixed(1)}h, avg_stress: ${avgStress.toFixed(1)}/10, avg_cognitive: ${avgCognitive.toFixed(0)}/100
low_sleep_negative_mood_rate: ${(sleepMoodCorr * 100).toFixed(0)}% (from ${lowSleepLogs.length} low-sleep days)

RAW LOGS (most recent 15):
${allLogs.slice(0,15).map(l => `sleep:${l.sleep_hours}h stress:${l.stress} conf:${l.confidence} imp:${l.impulse} mood:${l.mood_tag} cog:${l.cognitive_score} date:${l.timestamp?.split("T")[0]}`).join("\n")}

DECISION ACCURACY:
total_closed: ${closedDecisions.length}, avg_accuracy: ${avgAccuracy?.toFixed(0) ?? "N/A"}%
${closedDecisions.slice(0,8).map(d => `prob:${d.probability}% outcome:${d.outcome_rating} acc:${d.prediction_accuracy}`).join("\n")}

PROJECT ACTIVITY (last 7 days):
${(projects ?? []).map(p => `${p.name}: ${projFreq[p.id] ?? 0} updates`).join("\n")}

RULE VIOLATIONS (30 days): ${violations?.length ?? 0}
HIGH IMPULSE DAYS (recent 3 days): ${recentHighImpulse}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1000,
    messages: [
      {
        role: "system",
        content: `You are a pattern analyst for a personal cognitive OS. Generate 4-6 deep insights from the data.

For each insight calculate:
- confidence_score: 0.0–1.0 (based on sample size and consistency of pattern)
- supporting_records: exact number of records that support this insight
- time_window: "7 days", "14 days", "30 days", or "all time"
- strength: "weak" (< 0.4), "moderate" (0.4–0.7), "strong" (> 0.7)

Return ONLY a JSON array:
[{
  "domain": "behavior|decisions|projects",
  "insight_type": "pattern|warning|correlation|accuracy",
  "summary": "Specific observation with numbers. E.g: Sleep under 6h linked to negative mood in 4 of 5 cases (80%)",
  "recommended_focus": "One actionable suggestion or null",
  "confidence_score": 0.75,
  "supporting_records": 12,
  "time_window": "30 days",
  "strength": "strong"
}]

Only report patterns with at least 3 supporting records. Be specific with numbers. Return ONLY valid JSON.`
      },
      { role: "user", content: dataBlock }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const clean = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
  let insights = [];
  try { insights = JSON.parse(clean); } catch { return NextResponse.json({ generated: 0, predictions: predictions.length }); }

  // Write insights with depth fields
  await supabase.from("insights").delete().eq("user_id", user.id);
  for (const ins of insights) {
    await supabase.from("insights").insert({
      user_id: user.id,
      domain: ins.domain,
      insight_type: ins.insight_type,
      summary: ins.summary,
      recommended_focus: ins.recommended_focus,
      confidence_score: ins.confidence_score,
      supporting_records: ins.supporting_records,
      time_window: ins.time_window,
      strength: ins.strength,
      generated_on: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    generated: insights.length,
    predictions: predictions.length,
    avgCognitive: Math.round(avgCognitive),
    avgAccuracy: avgAccuracy ? Math.round(avgAccuracy) : null,
  });
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [{ data: logs }, { data: updates }, { data: decisions }, { data: projects }] = await Promise.all([
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, confidence, impulse, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(30),
    supabase.from("project_updates").select("project_id, update_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("decisions").select("context, verdict, probability, outcome_rating, actual_outcome, closed_at, created_at").eq("user_id", user.id),
    supabase.from("projects").select("id, name, updated_at").eq("user_id", user.id).eq("status", "active"),
  ]);

  if (!logs || logs.length < 2) return NextResponse.json({ generated: 0, reason: "Not enough data" });

  // Calculate decision accuracy scores
  const closedDecisions = (decisions ?? []).filter(d => d.outcome_rating && d.outcome_rating !== "pending" && d.probability);
  const accuracyData = closedDecisions.map(d => {
    const p = d.probability ?? 50;
    const success = d.outcome_rating === "success";
    const mixed = d.outcome_rating === "mixed";
    const score = success ? (100 - Math.abs(p - 100)) : mixed ? (100 - Math.abs(p - 50)) : (100 - p);
    return { context: d.context?.slice(0, 60), probability: p, outcome: d.outcome_rating, score };
  });

  // Update prediction_accuracy on decisions
  for (const d of closedDecisions) {
    const p = d.probability ?? 50;
    const success = d.outcome_rating === "success";
    const mixed = d.outcome_rating === "mixed";
    const score = success ? (100 - Math.abs(p - 100)) : mixed ? (100 - Math.abs(p - 50)) : (100 - p);
    await supabase.from("decisions")
      .update({ prediction_accuracy: score })
      .eq("user_id", user.id)
      .eq("context", d.context)
      .is("prediction_accuracy", null);
  }

  // Build data block for AI analysis
  const avgAccuracy = accuracyData.length ? Math.round(accuracyData.reduce((a, d) => a + d.score, 0) / accuracyData.length) : null;

  // Project update frequency analysis
  const projectFreq: Record<string, number> = {};
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  (updates ?? []).forEach(u => {
    if (u.created_at >= sevenDaysAgo) projectFreq[u.project_id] = (projectFreq[u.project_id] ?? 0) + 1;
  });

  const dataBlock = `
BEHAVIOR DATA (${logs.length} entries):
${logs.map(l => `sleep:${l.sleep_hours}h mood:${l.mood_tag} stress:${l.stress}/10 confidence:${l.confidence ?? "?"}/10 impulse:${l.impulse ?? "?"}/10 date:${l.timestamp?.split("T")[0]}`).join("\n")}

DECISION ACCURACY:
${accuracyData.length ? accuracyData.map(d => `- "${d.context}" prob:${d.probability}% outcome:${d.outcome} score:${d.score}`).join("\n") : "No closed decisions yet"}
${avgAccuracy !== null ? `Overall accuracy: ${avgAccuracy}%` : ""}

PROJECT ACTIVITY (last 7 days):
${(projects ?? []).map(p => `- ${p.name}: ${projectFreq[p.id] ?? 0} updates`).join("\n")}

DECISIONS UNDER STRESS:
${(decisions ?? []).filter(d => d.outcome_rating).map(d => `- outcome:${d.outcome_rating} context:"${d.context?.slice(0, 50)}"`).join("\n")}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: `You are a pattern analyst for a personal OS. Find real correlations and patterns in the data.
Generate 3-5 insights. Return ONLY a JSON array:
[{
  "domain": "behavior|decisions|projects",
  "insight_type": "pattern|warning|correlation|accuracy",
  "summary": "One specific data-backed observation. Include actual numbers.",
  "recommended_focus": "One concrete action or null"
}]

Examples of good insights:
- "Sleep under 6h correlates with anxious/frustrated mood in 4 of 5 cases"
- "Decision accuracy is 73% — probability estimates are slightly optimistic"
- "Raahbaan has 0 updates this week vs 3 last week — momentum dropped"
- "High stress days (7+) account for 60% of logged blockers"

No generic observations. Specific numbers only. Return ONLY valid JSON array.`
      },
      { role: "user", content: dataBlock }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const clean = raw.replace(/```json|```/g, "").trim();

  let insights = [];
  try { insights = JSON.parse(clean); } catch { return NextResponse.json({ generated: 0 }); }

  // Clear old AI insights and write fresh ones
  await supabase.from("insights").delete().eq("user_id", user.id);
  for (const ins of insights) {
    await supabase.from("insights").insert({
      user_id: user.id,
      domain: ins.domain,
      insight_type: ins.insight_type,
      summary: ins.summary,
      recommended_focus: ins.recommended_focus,
      generated_on: new Date().toISOString(),
    });
  }

  return NextResponse.json({ generated: insights.length, avgAccuracy });
}

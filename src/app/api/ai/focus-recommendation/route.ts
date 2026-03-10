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
  if (!user) return NextResponse.json({ recommendations: [] });

  // Return cached if still valid (within 12 hours)
  const { data: cached } = await supabase
    .from("focus_recommendations")
    .select("*")
    .eq("user_id", user.id)
    .gte("valid_until", new Date().toISOString())
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (cached) return NextResponse.json({ recommendations: cached.recommendations, cached: true });

  // Generate fresh
  const [{ data: projects }, { data: updates }, { data: decisions }, { data: logs }, { data: snap }, { data: insights }] = await Promise.all([
    supabase.from("projects").select("id,name,memory,updated_at").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("project_id,created_at").eq("user_id", user.id).gte("created_at", new Date(Date.now()-7*86400000).toISOString()),
    supabase.from("decisions").select("context,review_date,outcome_rating,created_at").eq("user_id", user.id).or("outcome_rating.is.null,outcome_rating.eq.pending").order("review_date", { ascending: true }).limit(5),
    supabase.from("behavior_logs").select("cognitive_score,stress,impulse,mood_tag").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(1),
    supabase.from("analytics_snapshots").select("avg_cognitive_score,avg_stress,dominant_mood").eq("user_id", user.id).order("snapshot_date", { ascending: false }).limit(1).single(),
    supabase.from("insights").select("summary,insight_type,strength").eq("user_id", user.id).eq("strength", "strong").limit(3),
  ]);

  // Project momentum scoring
  const updateMap: Record<string, number> = {};
  (updates ?? []).forEach(u => { updateMap[u.project_id] = (updateMap[u.project_id] ?? 0) + 1; });

  const projectScores = (projects ?? []).map(p => ({
    name: p.name,
    id: p.id,
    updates7d: updateMap[p.id] ?? 0,
    daysSinceUpdate: Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000),
    memory: p.memory ? p.memory.split("\n").slice(0, 2).join(" ") : null,
  }));

  const latestLog = logs?.[0];
  const currentCognitive = latestLog?.cognitive_score ?? (snap as any)?.avg_cognitive_score ?? 50;
  const currentStress = latestLog?.stress ?? (snap as any)?.avg_stress ?? 5;
  const overdue = (decisions ?? []).filter(d => d.review_date && new Date(d.review_date) < new Date());

  const contextBlock = `
CURRENT STATE: cognitive:${Math.round(currentCognitive)}/100 stress:${currentStress}/10 mood:${latestLog?.mood_tag ?? "unknown"}

PROJECTS (sorted by momentum):
${projectScores.sort((a,b) => b.updates7d - a.updates7d).map(p => `- ${p.name}: ${p.updates7d} updates this week, last update ${p.daysSinceUpdate}d ago${p.memory ? " | "+p.memory.slice(0,60) : ""}`).join("\n")}

OVERDUE DECISION REVIEWS: ${overdue.length}
${overdue.map(d => `- "${d.context?.slice(0,60)}" due ${d.review_date}`).join("\n")}

STRONG INSIGHTS:
${(insights ?? []).map(i => `- [${i.insight_type}] ${i.summary?.slice(0,80)}`).join("\n")}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: [
      {
        role: "system",
        content: `You generate today's priority focus recommendations for an entrepreneur.

Consider: project momentum, decision deadlines, current cognitive state, active insights.
If cognitive score is low (<50) or stress is high (>7), recommend lighter/reviewing tasks over heavy strategic work.

Return ONLY a JSON array of 3-4 items:
[{
  "rank": 1,
  "project_or_area": "Project name or area (e.g. Decisions, Check-in)",
  "reason": "Why this is priority today — specific, one sentence",
  "type": "momentum|stalled|decision|behavior|strategic",
  "urgency": "high|medium|low",
  "suggested_action": "One concrete thing to do"
}]

Return ONLY valid JSON array.`
      },
      { role: "user", content: contextBlock }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const clean = raw.replace(/```json|```/g, "").trim();
  let recs: any[] = [];
  try { recs = JSON.parse(clean); } catch { recs = []; }

  // Cache for 12 hours
  await supabase.from("focus_recommendations").insert({
    user_id: user.id,
    recommendations: recs,
    based_on_snapshot_date: new Date().toISOString().split("T")[0],
    cognitive_score_at_generation: Math.round(currentCognitive),
    valid_until: new Date(Date.now() + 12 * 3600000).toISOString(),
  });

  return NextResponse.json({ recommendations: recs, cached: false });
}

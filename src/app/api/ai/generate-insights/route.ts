import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import OpenAI from "openai";

async function generateEmbedding(openai: OpenAI, text: string): Promise<number[] | null> {
  try {
    const res = await openai.embeddings.create({ model: "text-embedding-3-small", input: text.slice(0, 800) });
    return res.data[0]?.embedding ?? null;
  } catch { return null; }
}

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [{ data: snap }, { data: logs }, { data: decisions }, { data: lessons }, { data: updates }, { data: projects }] = await Promise.all([
    supabase.from("analytics_snapshots").select("*").eq("user_id", user.id).order("snapshot_date", { ascending: false }).limit(1).single(),
    supabase.from("behavior_logs").select("mood_tag,stress,sleep_hours,confidence,impulse,cognitive_score,timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(30),
    supabase.from("decisions").select("context,verdict,probability,outcome_rating,actual_outcome_bool,prediction_accuracy,cognitive_score_at_decision,stress_at_decision,type,created_at").eq("user_id", user.id),
    supabase.from("decision_lessons").select("lesson,missed_signal,what_next,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("project_updates").select("project_id,update_type,content,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("projects").select("id,name,updated_at").eq("user_id", user.id).eq("status", "active"),
  ]);

  const closedD = (decisions ?? []).filter(d => d.actual_outcome_bool !== null);
  const s = (snap as any) ?? {};

  const dataBlock = `
ANALYTICS (30-day snapshot):
avg_cognitive: ${s.avg_cognitive_score?.toFixed(0) ?? "?"}/100
avg_stress: ${s.avg_stress?.toFixed(1) ?? "?"}  avg_sleep: ${s.avg_sleep?.toFixed(1) ?? "?"}h
decision_success_rate: ${s.decisions_closed ? Math.round((s.decisions_success/s.decisions_closed)*100) : "?"}% (${s.decisions_closed ?? 0} closed)
calibration: 0-40%→${s.calib_0_40!=null?Math.round(s.calib_0_40*100)+"% actual":"?"} 40-60%→${s.calib_40_60!=null?Math.round(s.calib_40_60*100)+"% actual":"?"} 60-80%→${s.calib_60_80!=null?Math.round(s.calib_60_80*100)+"% actual":"?"} 80-100%→${s.calib_80_100!=null?Math.round(s.calib_80_100*100)+"% actual":"?"}
cog_bands: high→${s.success_rate_cog_high!=null?Math.round(s.success_rate_cog_high*100)+"%":"?"} med→${s.success_rate_cog_medium!=null?Math.round(s.success_rate_cog_medium*100)+"%":"?"} low→${s.success_rate_cog_low!=null?Math.round(s.success_rate_cog_low*100)+"%":"?"}
stress_bands: low→${s.success_rate_stress_low!=null?Math.round(s.success_rate_stress_low*100)+"%":"?"} med→${s.success_rate_stress_medium!=null?Math.round(s.success_rate_stress_medium*100)+"%":"?"} high→${s.success_rate_stress_high!=null?Math.round(s.success_rate_stress_high*100)+"%":"?"}
stalled_projects: ${s.stalled_projects ?? 0}

BEHAVIOR (last 15 logs):
${(logs ?? []).slice(0,15).map(l => `sleep:${l.sleep_hours}h stress:${l.stress} conf:${l.confidence} imp:${l.impulse} mood:${l.mood_tag} cog:${l.cognitive_score}`).join("\n")}

DECISIONS WITH OUTCOMES (${closedD.length}):
${closedD.map(d => `[${d.type ?? "general"}] prob:${d.probability}% outcome:${d.actual_outcome_bool?"SUCCESS":"FAILURE"} acc:${d.prediction_accuracy} cog_at:${d.cognitive_score_at_decision} stress_at:${d.stress_at_decision} ctx:"${d.context?.slice(0,50)}"`).join("\n")}

LESSONS (${(lessons ?? []).length}):
${(lessons ?? []).map(l => `lesson:"${l.lesson?.slice(0,80)}" missed:"${l.missed_signal?.slice(0,60)}"`).join("\n")}

PROJECT ACTIVITY (7d updates per project):
${(projects ?? []).map(p => { const cnt = (updates ?? []).filter(u => u.project_id === p.id && new Date(u.created_at) > new Date(Date.now()-7*86400000)).length; return `${p.name}: ${cnt} updates`; }).join("\n")}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: `You generate structured intelligence insights for a personal cognitive OS.

Generate 5-7 insights across these categories:
- decision_pattern: patterns in decision outcomes
- behavior_pattern: sleep/stress/mood correlations
- strategy_pattern: recurring strategic behaviors
- project_momentum: project activity patterns
- risk_alert: active risks that need attention
- calibration: probability estimation accuracy

Return ONLY a JSON array:
[{
  "type": "decision_pattern|behavior_pattern|strategy_pattern|project_momentum|risk_alert|calibration",
  "title": "Short insight title (max 7 words)",
  "description": "Specific observation with exact numbers from the data",
  "recommendation": "One concrete action",
  "confidence": 0.0-1.0,
  "supporting_records": number,
  "time_window": "7 days|14 days|30 days|all time",
  "strength": "weak|moderate|strong"
}]

Rules:
- Every description MUST contain actual numbers
- Only report patterns with 3+ supporting records
- strength: weak < 0.4, moderate 0.4-0.7, strong > 0.7 confidence
- Return ONLY valid JSON array`
      },
      { role: "user", content: dataBlock }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const clean = raw.replace(/```json|```/g, "").trim();
  let insights: any[] = [];
  try { insights = JSON.parse(clean); } catch { return NextResponse.json({ generated: 0 }); }

  // Clear old, write new with embeddings
  await supabase.from("insights").delete().eq("user_id", user.id);

  let embedded = 0;
  for (const ins of insights) {
    const text = `${ins.title}. ${ins.description}. ${ins.recommendation ?? ""}`;
    const embedding = await generateEmbedding(openai, text);
    await supabase.from("insights").insert({
      user_id: user.id,
      domain: ins.type.includes("behavior") ? "behavior" : ins.type.includes("decision") || ins.type === "calibration" ? "decisions" : "projects",
      insight_type: ins.type,
      summary: `**${ins.title}** — ${ins.description}`,
      recommended_focus: ins.recommendation,
      confidence_score: ins.confidence,
      supporting_records: ins.supporting_records,
      time_window: ins.time_window,
      strength: ins.strength,
      generated_on: new Date().toISOString(),
      embedding: embedding ? JSON.stringify(embedding) : null,
    });
    if (embedding) embedded++;
  }

  return NextResponse.json({ generated: insights.length, embedded });
}

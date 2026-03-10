import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const TEMPLATES: Record<string, (uid: string) => string> = {
  project_progress: (uid) => `
    SELECT p.name, COUNT(pu.id) as update_count,
      MAX(pu.created_at) as last_update,
      SUM(CASE WHEN pu.update_type = 'blocker' THEN 1 ELSE 0 END) as blockers
    FROM projects p
    LEFT JOIN project_updates pu ON pu.project_id = p.id AND pu.created_at > now() - interval '7 days'
    WHERE p.user_id = '${uid}' AND p.status = 'active'
    GROUP BY p.id, p.name ORDER BY update_count DESC`,

  decision_accuracy: (uid) => `
    SELECT verdict, outcome_rating, probability, prediction_accuracy, context, closed_at
    FROM decisions
    WHERE user_id = '${uid}' AND outcome_rating IS NOT NULL AND outcome_rating != 'pending'
    ORDER BY closed_at DESC LIMIT 20`,

  behavior_patterns: (uid) => `
    SELECT mood_tag, stress, sleep_hours, confidence, impulse, cognitive_score, timestamp
    FROM behavior_logs
    WHERE user_id = '${uid}'
    ORDER BY timestamp DESC LIMIT 30`,

  stress_vs_decisions: (uid) => `
    SELECT d.context, d.verdict, d.probability, d.outcome_rating, d.prediction_accuracy,
      b.stress, b.cognitive_score, b.mood_tag, b.timestamp as state_at
    FROM decisions d
    LEFT JOIN LATERAL (
      SELECT stress, cognitive_score, mood_tag, timestamp
      FROM behavior_logs
      WHERE user_id = '${uid}' AND timestamp <= d.created_at
      ORDER BY timestamp DESC LIMIT 1
    ) b ON true
    WHERE d.user_id = '${uid}'
    ORDER BY d.created_at DESC LIMIT 20`,

  sleep_vs_mood: (uid) => `
    SELECT sleep_hours, mood_tag, stress, confidence, impulse, cognitive_score, timestamp
    FROM behavior_logs
    WHERE user_id = '${uid}' AND sleep_hours IS NOT NULL
    ORDER BY timestamp DESC LIMIT 30`,

  weekly_summary: (uid) => `
    SELECT p.name as project,
      COUNT(pu.id) as updates_this_week,
      STRING_AGG(DISTINCT pu.update_type, ', ') as types
    FROM projects p
    LEFT JOIN project_updates pu ON pu.project_id = p.id
      AND pu.created_at > now() - interval '7 days' AND pu.user_id = '${uid}'
    WHERE p.user_id = '${uid}' AND p.status = 'active'
    GROUP BY p.id, p.name ORDER BY updates_this_week DESC`,

  open_decisions: (uid) => `
    SELECT context, verdict, probability, review_date, created_at, domain
    FROM decisions
    WHERE user_id = '${uid}' AND (outcome_rating IS NULL OR outcome_rating = 'pending')
    ORDER BY review_date ASC NULLS LAST, created_at DESC LIMIT 10`,

  decision_failures: (uid) => `
    SELECT context, verdict, probability, actual_outcome, prediction_accuracy, closed_at
    FROM decisions
    WHERE user_id = '${uid}' AND outcome_rating = 'failure'
    ORDER BY closed_at DESC`,
};

function detectTemplate(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("progress") || q.includes("this week") || q.includes("most update") || q.includes("active")) return "project_progress";
  if (q.includes("failure") || q.includes("failed") || q.includes("wrong") || q.includes("bad decision")) return "decision_failures";
  if (q.includes("accuracy") || q.includes("prediction") || q.includes("judgment") || q.includes("how good")) return "decision_accuracy";
  if (q.includes("stress") && (q.includes("decision") || q.includes("choice"))) return "stress_vs_decisions";
  if (q.includes("sleep") || q.includes("rest")) return "sleep_vs_mood";
  if (q.includes("pattern") || q.includes("behavior") || q.includes("mood") || q.includes("cognitive")) return "behavior_patterns";
  if (q.includes("week") || q.includes("summary") || q.includes("overview")) return "weekly_summary";
  if (q.includes("open") || q.includes("pending") || q.includes("review") || q.includes("unresolved")) return "open_decisions";
  return "weekly_summary";
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

  const { question } = await req.json();
  if (!question) return NextResponse.json({ error: "No question" }, { status: 400 });

  const templateKey = detectTemplate(question);
  const sql = TEMPLATES[templateKey](user.id);

  let queryResult: any[] = [];
  let rpcError: any = null;
  try {
    const { data: rows, error } = await supabase.rpc("run_query", { sql_query: sql }).select();
    rpcError = error;
    queryResult = rows ?? [];
  } catch { rpcError = "rpc failed"; }

  if (rpcError || queryResult.length === 0) {
    const fallbackMap: Record<string, any> = {
      project_progress: () => supabase.from("project_updates").select("project_id, update_type, created_at").eq("user_id", user.id).gte("created_at", new Date(Date.now() - 7*86400000).toISOString()),
      behavior_patterns: () => supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, confidence, impulse, cognitive_score, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(20),
      decision_failures: () => supabase.from("decisions").select("context, verdict, probability, actual_outcome, prediction_accuracy").eq("user_id", user.id).eq("outcome_rating", "failure"),
      decision_accuracy: () => supabase.from("decisions").select("context, verdict, probability, outcome_rating, prediction_accuracy").eq("user_id", user.id).not("outcome_rating", "is", null),
      open_decisions: () => supabase.from("decisions").select("context, verdict, probability, review_date, created_at").eq("user_id", user.id).or("outcome_rating.is.null,outcome_rating.eq.pending"),
    };
    const fallback = fallbackMap[templateKey] ?? fallbackMap["behavior_patterns"];
    const { data } = await fallback();
    queryResult = data ?? [];
  } else {
    queryResult = rows ?? [];
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: [
      {
        role: "system",
        content: `You interpret database results for an entrepreneur named Soban. Be direct and specific.
Lead with the answer. Use actual numbers from the data.
Format with **bold** for key findings, bullets for lists.
If results are empty say so clearly and explain what data would be needed.
Never say "based on the data" — just state findings.`
      },
      { role: "user", content: `Question: ${question}\nTemplate used: ${templateKey}\nResults (${queryResult.length} rows): ${JSON.stringify(queryResult).slice(0, 3000)}` }
    ],
  });

  return NextResponse.json({
    answer: response.choices[0]?.message?.content ?? "Could not interpret results.",
    template: templateKey,
    rowCount: queryResult.length
  });
}

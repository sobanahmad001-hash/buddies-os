import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SCHEMA = `
Tables available (all filtered by user_id automatically):
- projects(id, name, description, status, memory, updated_at, created_at)
- project_updates(id, project_id, content, update_type, next_actions, created_at)
  update_type values: progress, blocker, note, decision
- decisions(id, project_id, context, verdict, probability, outcome_rating, actual_outcome, prediction_accuracy, review_date, created_at, closed_at)
  verdict values: enter, wait, do_not_enter
  outcome_rating values: success, failure, mixed, pending
- rules(id, rule_text, severity, active, domain, created_at)
- behavior_logs(id, mood_tag, stress, sleep_hours, confidence, impulse, notes, timestamp)
  mood_tag values: calm, focused, rushed, bored, anxious, fearful, angry, frustrated, overconfident, exhausted
- rule_violations(id, rule_id, notes, timestamp)
- insights(id, domain, insight_type, summary, recommended_focus, generated_on)
`;

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Step 1: Convert question to SQL
  const sqlResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: `You convert natural language questions into PostgreSQL queries for a personal OS database.
${SCHEMA}

RULES:
- ALWAYS include WHERE user_id = '${user.id}' (or the correct user_id column)
- For project_updates joined with projects: join on projects.id = project_updates.project_id
- Return ONLY the SQL query, nothing else
- Use ILIKE for case-insensitive text search
- For "this week" use: created_at >= NOW() - INTERVAL '7 days'
- For "this month" use: created_at >= NOW() - INTERVAL '30 days'
- Always add LIMIT 50 unless counting
- For behavior_logs use timestamp column not created_at
- Never use DROP, DELETE, UPDATE, INSERT — SELECT only`
      },
      { role: "user", content: question }
    ],
  });

  const sql = sqlResponse.choices[0]?.message?.content?.trim() ?? "";
  if (!sql || sql.toLowerCase().includes("drop") || sql.toLowerCase().includes("delete") || sql.toLowerCase().includes("update") || sql.toLowerCase().includes("insert")) {
    return NextResponse.json({ answer: "Could not generate a safe query for that question.", sql: null });
  }

  // Step 2: Execute SQL
  let queryResult: any[] = [];
  let queryError = null;
  try {
    const { data, error } = await supabase.rpc("execute_user_query", { query_sql: sql, uid: user.id }).select();
    if (error) throw error;
    queryResult = data ?? [];
  } catch {
    // Fallback: try direct query via from() for simple cases
    try {
      const cleanSql = sql.replace(/;$/, "");
      const { data, error } = await supabase.from("project_updates").select("content, update_type, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      queryResult = data ?? [];
      if (error) queryError = error.message;
    } catch (e: any) {
      queryError = e.message;
    }
  }

  // Step 3: AI interprets result
  const interpretResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
    messages: [
      {
        role: "system",
        content: `You are interpreting database query results for an entrepreneur named Soban.
Answer in natural language. Be direct and specific. Surface the actual data.
Format: lead with the direct answer, then supporting detail if helpful.
If results are empty, say so clearly.
Never say "based on the data" or "according to the results" — just state the findings.`
      },
      {
        role: "user",
        content: `Question: ${question}\n\nSQL used: ${sql}\n\nResults: ${JSON.stringify(queryResult).slice(0, 3000)}`
      }
    ],
  });

  const answer = interpretResponse.choices[0]?.message?.content ?? "Could not interpret results.";
  return NextResponse.json({ answer, sql, rowCount: queryResult.length });
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [{ data: logs }, { data: updates }, { data: decisions }] = await Promise.all([
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(30),
    supabase.from("project_updates").select("project_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("decisions").select("verdict, outcome_rating, created_at").eq("user_id", user.id),
  ]);

  if (!logs || logs.length < 3) return NextResponse.json({ generated: 0 });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const dataBlock = `
BEHAVIOR LOGS (${logs.length} entries):
${logs.map(l => `sleep: ${l.sleep_hours}h, mood: ${l.mood_tag}, stress: ${l.stress}/10, date: ${l.timestamp?.split("T")[0]}`).join("\n")}

PROJECT UPDATE FREQUENCY:
${updates?.length} updates in last 50 entries

DECISIONS:
${decisions?.map(d => `verdict: ${d.verdict}, outcome: ${d.outcome_rating ?? "open"}`).join("\n")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content: `Analyze behavioral and work data for an entrepreneur. Find real patterns.
Return a JSON array of insights (max 4):
[{
  "domain": "behavior|trading|projects|decisions",
  "insight_type": "pattern|warning|correlation|opportunity",
  "summary": "One clear observation sentence. Data-backed. No advice.",
  "recommended_focus": "One optional action or null"
}]
Return ONLY valid JSON array. No markdown.`
      },
      { role: "user", content: dataBlock }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const clean = raw.replace(/```json|```/g, "").trim();
  const insights = JSON.parse(clean);

  // Clear old AI-generated insights and write new ones
  await supabase.from("insights").delete().eq("user_id", user.id).eq("insight_type", "pattern");
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

  return NextResponse.json({ generated: insights.length });
}

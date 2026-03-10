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

  const { decisionId } = await req.json();

  // Load the decision
  const { data: decision } = await supabase
    .from("decisions")
    .select("*")
    .eq("id", decisionId)
    .eq("user_id", user.id)
    .single();

  if (!decision) return NextResponse.json({ error: "Decision not found" }, { status: 404 });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `A decision has just been closed. Generate a structured lesson from it.

Decision: "${decision.context}"
Verdict: ${decision.verdict}
Predicted probability: ${decision.probability ?? "unknown"}%
Outcome: ${decision.actual_outcome_bool ? "SUCCESS" : "FAILURE"}
Outcome rating: ${decision.outcome_rating}
Actual outcome: ${decision.actual_outcome ?? "not recorded"}

Cognitive state when decided:
- Sleep: ${decision.sleep_at_decision ?? "unknown"}h
- Stress: ${decision.stress_at_decision ?? "unknown"}/10
- Confidence: ${decision.confidence_at_decision ?? "unknown"}/10
- Impulse: ${decision.impulse_at_decision ?? "unknown"}/10
- Cognitive score: ${decision.cognitive_score_at_decision ?? "unknown"}/100

Return ONLY a JSON object:
{
  "lesson": "The core lesson from this decision in 1-2 sentences",
  "missed_signal": "What signal was missed or ignored, or null if successful",
  "what_next": "One concrete thing to do differently next time"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  let lessonData = { lesson: "", missed_signal: null, what_next: "" };
  try { lessonData = JSON.parse(clean); } catch {}

  const { data: saved } = await supabase.from("decision_lessons").insert({
    user_id: user.id,
    decision_id: decisionId,
    lesson: lessonData.lesson,
    missed_signal: lessonData.missed_signal,
    what_next: lessonData.what_next,
  }).select().single();

  return NextResponse.json({ lesson: saved });
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ lessons: [] });

  const { data } = await supabase
    .from("decision_lessons")
    .select("*, decisions(context, verdict, actual_outcome_bool, outcome_rating)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ lessons: data ?? [] });
}

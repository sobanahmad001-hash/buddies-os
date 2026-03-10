import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import OpenAI from "openai";

async function embed(openai: OpenAI, text: string): Promise<number[] | null> {
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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let embedded = 0;

  // Embed decisions without embeddings
  const { data: decisions } = await supabase.from("decisions").select("id,context,actual_outcome,outcome_rating").eq("user_id", user.id).is("embedding", null).limit(20);
  for (const d of decisions ?? []) {
    const text = `Decision: ${d.context}. Outcome: ${d.outcome_rating ?? "open"}. ${d.actual_outcome ?? ""}`;
    const vec = await embed(openai, text);
    if (vec) { await supabase.from("decisions").update({ embedding: JSON.stringify(vec) }).eq("id", d.id); embedded++; }
  }

  // Embed lessons without embeddings
  const { data: lessons } = await supabase.from("decision_lessons").select("id,lesson,missed_signal,what_next").eq("user_id", user.id).is("embedding", null).limit(20);
  for (const l of lessons ?? []) {
    const text = `Lesson: ${l.lesson}. Missed signal: ${l.missed_signal ?? "none"}. Next time: ${l.what_next ?? ""}`;
    const vec = await embed(openai, text);
    if (vec) { await supabase.from("decision_lessons").update({ embedding: JSON.stringify(vec) }).eq("id", l.id); embedded++; }
  }

  return NextResponse.json({ embedded });
}

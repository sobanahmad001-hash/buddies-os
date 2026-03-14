import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function calcCognitiveScore(log: any): number {
  const sleep = log.sleep_hours ?? 7;
  const stress = log.stress ?? 5;
  const confidence = log.confidence ?? 5;
  const impulse = log.impulse ?? 5;
  const sleepFactor = Math.min(sleep / 8, 1) * 30;
  const confidenceFactor = (confidence / 10) * 25;
  const stressPenalty = (stress / 10) * 30;
  const impulsePenalty = (impulse / 10) * 15;
  const moodBoost: Record<string, number> = {
    calm: 8, focused: 10, overconfident: -5,
    anxious: -8, fearful: -10, angry: -10,
    frustrated: -6, rushed: -4, bored: -2, exhausted: -8,
  };
  const moodMod = moodBoost[log.mood_tag ?? "calm"] ?? 0;
  const raw = 50 + sleepFactor + confidenceFactor - stressPenalty - impulsePenalty + moodMod;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);

  const { data: logs } = await supabase
    .from("behavior_logs")
    .select("id, mood_tag, stress, sleep_hours, sleep_quality, confidence, impulse, cognitive_score, notes, timestamp")
    .eq("user_id", user.id)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (!logs?.length) return NextResponse.json({ logs: [] });

  // Back-fill cognitive scores for any logs missing them
  for (const log of logs) {
    if (log.cognitive_score == null) {
      log.cognitive_score = calcCognitiveScore(log);
      await supabase.from("behavior_logs").update({ cognitive_score: log.cognitive_score }).eq("id", log.id);
    }
  }

  return NextResponse.json({ logs });
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ insights: [] });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: projects }, { data: updates }, { data: decisions }, { data: logs }, { data: violations }] = await Promise.all([
    supabase.from("projects").select("id, name, updated_at").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("project_id, created_at").eq("user_id", user.id).gte("created_at", sevenDaysAgo),
    supabase.from("decisions").select("context, review_date, verdict, created_at").eq("user_id", user.id).not("review_date", "is", null),
    supabase.from("behavior_logs").select("mood_tag, stress, timestamp").eq("user_id", user.id).gte("timestamp", threeDaysAgo).order("timestamp", { ascending: false }),
    supabase.from("rule_violations").select("rule_id, timestamp").eq("user_id", user.id).gte("timestamp", sevenDaysAgo),
  ]);

  const insights: { type: string; message: string; severity: "info" | "warn" | "alert" }[] = [];

  // Stale projects — no updates in 7+ days
  const updatesByProject = new Set((updates ?? []).map(u => u.project_id));
  for (const p of projects ?? []) {
    const daysSince = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
    if (!updatesByProject.has(p.id) && daysSince >= 5) {
      insights.push({
        type: "stale_project",
        message: `${p.name} has had no updates in ${daysSince} days`,
        severity: daysSince >= 10 ? "alert" : "warn",
      });
    }
  }

  // Mood pattern — anxious/stressed multiple days
  const recentMoods = (logs ?? []).map(l => l.mood_tag);
  const negMoods = recentMoods.filter(m => ["anxious", "frustrated", "angry", "fearful", "exhausted"].includes(m ?? ""));
  if (negMoods.length >= 2) {
    insights.push({
      type: "mood_pattern",
      message: `You've logged ${negMoods[0]} and ${negMoods[1]} in the last 3 days — watch your decision quality`,
      severity: "warn",
    });
  }

  // High stress
  const highStress = (logs ?? []).filter(l => (l.stress ?? 0) >= 7);
  if (highStress.length >= 2) {
    insights.push({
      type: "high_stress",
      message: `Stress has been 7+ for ${highStress.length} consecutive logs — avoid major decisions`,
      severity: "alert",
    });
  }

  // Decisions with overdue review dates
  const today = new Date().toISOString().split("T")[0];
  const overdue = (decisions ?? []).filter(d => d.review_date && d.review_date <= today);
  for (const d of overdue.slice(0, 2)) {
    insights.push({
      type: "decision_review",
      message: `Decision review overdue: "${d.context?.slice(0, 60)}..."`,
      severity: "info",
    });
  }

  // Rule violations spike
  if ((violations ?? []).length >= 3) {
    insights.push({
      type: "violations",
      message: `${violations!.length} rule violations this week — a pattern is forming`,
      severity: "alert",
    });
  }

  // No daily check in 3 days
  if ((logs ?? []).length === 0) {
    insights.push({
      type: "no_checkin",
      message: "No daily check-ins in 3+ days — your behavioral data is going dark",
      severity: "info",
    });
  }

  return NextResponse.json({ insights: insights.slice(0, 4) });
}

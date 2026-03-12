import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [
    { data: projects },
    { data: updates },
    { data: decisions },
    { data: rules },
    { data: logs },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, status").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("content, update_type, project_id, projects(name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(15),
    supabase.from("decisions").select("context, verdict, probability, outcome_rating, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("rules").select("rule_text, severity").eq("user_id", user.id).eq("active", true),
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(7),
  ]);

  return NextResponse.json({
    projects: (projects ?? []).map((p: any) => ({ id: p.id, name: p.name, status: p.status })),
    recent_updates: (updates ?? []).map((u: any) => ({
      project: (u.projects as any)?.name ?? "unknown",
      type: u.update_type,
      content: u.content,
    })),
    decisions: (decisions ?? []).map((d: any) => ({
      project: "—",
      decision: d.context,
      status: d.verdict?.toUpperCase() ?? "OPEN",
      confidence: d.probability ?? undefined,
      deadline: undefined,
    })),
    active_rules: (rules ?? []).map((r: any) => ({ severity: r.severity, rule: r.rule_text })),
    behavior: (logs ?? []).map((l: any) => ({
      mood: l.mood_tag ?? undefined,
      stress: l.stress ?? undefined,
      sleep: l.sleep_hours ?? undefined,
    })),
  });
}

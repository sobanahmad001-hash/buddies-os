import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/debug/context
 * Returns a summary of everything saved in the database for the current user.
 * Open this URL in your browser while logged in to verify data is persisting.
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in — open /login first" }, { status: 401 });
  }

  // Run all counts in parallel
  const [
    { data: sessions,      count: sessionCount },
    { data: projects,      count: projectCount },
    { data: tasks,         count: taskCount },
    { data: updates,       count: updateCount },
    { data: decisions,     count: decisionCount },
    { data: rules,         count: ruleCount },
    { data: behaviorLogs,  count: logCount },
    { data: workspace },
  ] = await Promise.all([
    supabase.from("ai_sessions")    .select("id, title, updated_at",      { count: "exact" }).eq("user_id", user.id).order("updated_at", { ascending: false }).limit(5),
    supabase.from("projects")       .select("id, name, status, memory",   { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("project_tasks")  .select("id, title, status",          { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("project_updates").select("content, update_type, created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("decisions")      .select("context, verdict, created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("rules")          .select("rule_text, severity, active", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("behavior_logs")  .select("mood_tag, stress, sleep_hours, timestamp", { count: "exact" }).eq("user_id", user.id).order("timestamp", { ascending: false }).limit(5),
    supabase.from("workspaces")     .select("id, name, owner_id").eq("owner_id", user.id).maybeSingle(),
  ]);

  // Check clients if workspace exists
  let clients: any[] = [];
  let clientCount = 0;
  if (workspace) {
    const { data: c, count } = await supabase
      .from("clients")
      .select("id, name, status", { count: "exact" })
      .eq("workspace_id", (workspace as any).id)
      .limit(5);
    clients = c ?? [];
    clientCount = count ?? 0;
  }

  const report = {
    user_id: user.id,
    email: user.email,
    workspace: workspace ?? null,
    summary: {
      ai_sessions:     sessionCount  ?? 0,
      projects:        projectCount  ?? 0,
      project_tasks:   taskCount     ?? 0,
      project_updates: updateCount   ?? 0,
      decisions:       decisionCount ?? 0,
      rules:           ruleCount     ?? 0,
      behavior_logs:   logCount      ?? 0,
      clients:         clientCount,
    },
    recent: {
      ai_sessions: (sessions ?? []).map((s: any) => ({
        id:    s.id,
        title: s.title,
        saved: s.updated_at,
      })),
      projects: (projects ?? []).map((p: any) => ({
        name:      p.name,
        status:    p.status,
        has_memory: !!p.memory,
      })),
      tasks: (tasks ?? []).map((t: any) => ({ title: t.title, status: t.status })),
      updates: (updates ?? []).map((u: any) => ({
        type:    u.update_type,
        content: u.content?.slice(0, 80),
        saved:   u.created_at,
      })),
      decisions: (decisions ?? []).map((d: any) => ({
        context: d.context?.slice(0, 80),
        verdict: d.verdict,
        saved:   d.created_at,
      })),
      rules: (rules ?? []).map((r: any) => ({
        rule:     r.rule_text?.slice(0, 80),
        severity: r.severity,
        active:   r.active,
      })),
      behavior_logs: (behaviorLogs ?? []).map((l: any) => ({
        mood:  l.mood_tag,
        stress: l.stress,
        sleep: l.sleep_hours,
        when:  l.timestamp,
      })),
      clients: clients.map((c: any) => ({ name: c.name, status: c.status })),
    },
    status: "✅ Context is being saved correctly",
  };

  // If everything is 0, flag it
  const total = Object.values(report.summary).reduce((a: any, b: any) => a + b, 0);
  if (total === 0) {
    report.status = "⚠️ No data found yet — have you started a conversation in /app/ai?";
  }

  return NextResponse.json(report, { status: 200 });
}

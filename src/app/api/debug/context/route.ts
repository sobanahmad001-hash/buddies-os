import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/debug/context
 * Returns a full summary of everything saved in the database for the current user
 * including 24h activity, department data, and migration status checks.
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

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Run all owner-level counts in parallel
  const [
    { data: sessions,      count: sessionCount },
    { data: sessions24h,   count: session24hCount },
    { data: projects,      count: projectCount },
    { data: tasks,         count: taskCount },
    { data: updates,       count: updateCount },
    { data: updates24h,    count: update24hCount },
    { data: decisions,     count: decisionCount },
    { data: rules,         count: ruleCount },
    { data: behaviorLogs,  count: logCount },
    { data: workspace },
  ] = await Promise.all([
    supabase.from("ai_sessions")    .select("id, title, updated_at",      { count: "exact" }).eq("user_id", user.id).order("updated_at", { ascending: false }).limit(5),
    supabase.from("ai_sessions")    .select("id",                         { count: "exact" }).eq("user_id", user.id).gte("updated_at", since24h),
    supabase.from("projects")       .select("id, name, status, memory",   { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("project_tasks")  .select("id, title, status",          { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("project_updates").select("content, update_type, created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("project_updates").select("id",                         { count: "exact" }).eq("user_id", user.id).gte("created_at", since24h),
    supabase.from("decisions")      .select("context, verdict, created_at", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("rules")          .select("rule_text, severity, active", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("behavior_logs")  .select("mood_tag, stress, sleep_hours, timestamp", { count: "exact" }).eq("user_id", user.id).order("timestamp", { ascending: false }).limit(5),
    supabase.from("workspaces")     .select("id, name, owner_id").eq("owner_id", user.id).maybeSingle(),
  ]);

  // Check clients if workspace exists
  let clients: any[] = [];
  let clientCount = 0;
  let deptData: any = null;
  let migrationStatus: Record<string, string> = {};

  if (workspace) {
    const wsId = (workspace as any).id;

    const [
      { data: c, count: cc },
      { data: depts, error: deptsErr },
      { data: deptProjects, count: deptProjCount, error: deptProjErr },
      { data: deptChatMsgs, count: deptChatCount, error: deptChatErr },
      { data: deptChatMsgs24h, count: deptChat24hCount },
    ] = await Promise.all([
      supabase.from("clients").select("id, name, status", { count: "exact" }).eq("workspace_id", wsId).limit(5),
      supabase.from("departments").select("id, name, slug, color").eq("workspace_id", wsId),
      supabase.from("dept_projects").select("id, name, status, dept_id", { count: "exact" }).eq("workspace_id", wsId).order("updated_at", { ascending: false }).limit(10),
      supabase.from("dept_chat_messages").select("id, dept_id, role, content, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(10),
      supabase.from("dept_chat_messages").select("id", { count: "exact" }).gte("created_at", since24h),
    ]);

    clients = c ?? [];
    clientCount = cc ?? 0;

    // Migration status checks
    migrationStatus = {
      "departments (workspace_id + slug)": deptsErr ? `❌ Error: ${deptsErr.message}` : (depts?.length ? `✅ ${depts.length} department(s) seeded` : "⚠️ Table exists but no departments seeded — run migration 20250109"),
      "dept_projects table": deptProjErr ? `❌ Table missing — run migration 20250108: ${deptProjErr.message}` : `✅ Exists (${deptProjCount ?? 0} projects)`,
      "dept_chat_messages table": deptChatErr ? `❌ Table missing — run migration 20250108: ${deptChatErr.message}` : `✅ Exists (${deptChatCount ?? 0} messages total, ${deptChat24hCount ?? 0} in last 24h)`,
    };

    const deptMap: Record<string, string> = {};
    (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });

    deptData = {
      departments: (depts ?? []).map((d: any) => ({ name: d.name, slug: d.slug, color: d.color })),
      dept_projects_total: deptProjCount ?? 0,
      dept_projects_recent: (deptProjects ?? []).map((p: any) => ({
        name: p.name, status: p.status, dept: deptMap[p.dept_id] ?? "?",
      })),
      dept_chat_messages_total: deptChatCount ?? 0,
      dept_chat_messages_last24h: deptChat24hCount ?? 0,
      dept_chat_recent: (deptChatMsgs ?? []).slice(0, 5).map((m: any) => ({
        dept: deptMap[m.dept_id] ?? m.dept_id,
        role: m.role,
        preview: (m.content ?? "").slice(0, 60),
        when: m.created_at,
      })),
    };
  }

  const report: any = {
    user_id: user.id,
    email: user.email,
    workspace: workspace ?? null,
    last_24h_activity: {
      ai_sessions_updated: session24hCount ?? 0,
      project_updates_logged: update24hCount ?? 0,
      dept_chat_messages: deptData?.dept_chat_messages_last24h ?? "n/a (no workspace)",
    },
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
    dept_data: deptData,
    migration_status: migrationStatus,
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
  const total = Object.values(report.summary as Record<string, number>).reduce((a, b) => a + b, 0);
  if (total === 0) {
    report.status = "⚠️ No data found yet — have you started a conversation in /app/ai?";
  }

  return NextResponse.json(report, { status: 200 });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function activityLevel(msgCount: number, taskCount: number, decisionCount: number): string {
  const score = msgCount * 0.5 + taskCount * 1.5 + decisionCount * 2;
  if (score >= 20) return "high";
  if (score >= 8) return "steady";
  if (score >= 3) return "light";
  return "low";
}

function inferCognitive(level: string, sessionCount: number): number {
  // Infer cognitive score from activity patterns
  // High activity + multiple sessions = likely high cognitive engagement
  const base = level === "high" ? 78 : level === "steady" ? 68 : level === "light" ? 58 : 50;
  const sessionBonus = Math.min(sessionCount * 3, 15);
  return Math.min(base + sessionBonus, 95);
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    // Read today's usage passively
    const [
      { data: aiUsage },
      { data: tasksCreated },
      { data: tasksCompleted },
      { data: decisions },
      { data: chatMessages },
    ] = await Promise.all([
      supabase.from("ai_usage").select("session_id, created_at").eq("user_id", user.id)
        .gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("project_tasks").select("project_id, projects(name)").eq("user_id", user.id)
        .gte("created_at", todayStart),
      supabase.from("project_tasks").select("project_id").eq("user_id", user.id)
        .eq("status", "done").gte("updated_at", todayStart),
      supabase.from("decisions").select("project_id").eq("user_id", user.id)
        .gte("created_at", todayStart),
      supabase.from("project_chat_messages").select("project_id, projects(name)").eq("user_id", user.id)
        .gte("created_at", todayStart).eq("role", "user"),
    ]);

    const msgCount = (aiUsage ?? []).length + (chatMessages ?? []).length;
    const sessionCount = new Set((aiUsage ?? []).map((u: any) => u.session_id).filter(Boolean)).size;
    const taskCreatedCount = (tasksCreated ?? []).length;
    const taskCompletedCount = (tasksCompleted ?? []).length;
    const decisionCount = (decisions ?? []).length;

    // Infer dominant project from message activity
    const projectFreq: Record<string, number> = {};
    (chatMessages ?? []).forEach((m: any) => {
      const name = m.projects?.name;
      if (name) projectFreq[name] = (projectFreq[name] ?? 0) + 1;
    });
    const dominantProject = Object.entries(projectFreq).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
    const activeProjects = [...new Set([
      ...(chatMessages ?? []).map((m: any) => m.projects?.name).filter(Boolean),
      ...(tasksCreated ?? []).map((m: any) => m.projects?.name).filter(Boolean),
    ])] as string[];

    const level = activityLevel(msgCount, taskCreatedCount + taskCompletedCount, decisionCount);
    const cogScore = inferCognitive(level, sessionCount);

    // Upsert — runs once per day, idempotent
    await supabase.from("inferred_behavior").upsert({
      user_id: user.id,
      infer_date: today,
      message_count: msgCount,
      session_count: sessionCount,
      task_created_count: taskCreatedCount,
      task_completed_count: taskCompletedCount,
      decision_count: decisionCount,
      active_projects: activeProjects,
      dominant_project: dominantProject,
      activity_level: level,
      inferred_cognitive_score: cogScore,
      notes: `Auto-inferred from ${msgCount} messages, ${sessionCount} sessions, ${taskCreatedCount} tasks created`,
    }, { onConflict: "user_id,infer_date" });

    // Also write to behavior_logs so existing pattern correlations work
    const existingLog = await supabase.from("behavior_logs")
      .select("id").eq("user_id", user.id)
      .gte("timestamp", todayStart).maybeSingle();

    if (!existingLog.data) {
      await supabase.from("behavior_logs").insert({
        user_id: user.id,
        cognitive_score: cogScore,
        mood_tag: level === "high" ? "focused" : level === "low" ? "exhausted" : "calm",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ inferred: true, level, cogScore, msgCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

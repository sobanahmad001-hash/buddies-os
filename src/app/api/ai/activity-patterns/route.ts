import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function uniq<T>(items: T[]) {
  return [...new Set(items)];
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function classifyExecutionPace(updateCount: number, taskCount: number, decisionCount: number) {
  const score = updateCount * 1.2 + taskCount * 0.8 + decisionCount * 0.6;

  if (score >= 18) return "high";
  if (score >= 8) return "steady";
  if (score >= 3) return "light";
  return "low";
}

function classifyBlockerPressure(blockerCount: number) {
  if (blockerCount >= 5) return "high";
  if (blockerCount >= 2) return "medium";
  return "low";
}

function classifyDecisionTempo(decisionCount: number) {
  if (decisionCount >= 6) return "high";
  if (decisionCount >= 2) return "moderate";
  return "low";
}

function buildSummary(args: {
  activeProjects: string[];
  touchedProjects: string[];
  updateCount: number;
  blockerCount: number;
  taskCount: number;
  decisionCount: number;
  sessionFocuses: string[];
  memorySignals: string[];
}) {
  const executionPace = classifyExecutionPace(args.updateCount, args.taskCount, args.decisionCount);
  const blockerPressure = classifyBlockerPressure(args.blockerCount);
  const decisionTempo = classifyDecisionTempo(args.decisionCount);

  const strongestFocus =
    args.sessionFocuses[0] ||
    args.touchedProjects[0] ||
    args.activeProjects[0] ||
    null;

  const summaryLines: string[] = [];

  summaryLines.push(
    `Over the last 7 days, operating pace was ${executionPace}. ` +
    `${args.updateCount} updates, ${args.taskCount} task changes, and ${args.decisionCount} decisions were recorded.`
  );

  if (args.touchedProjects.length > 0) {
    summaryLines.push(
      `Most visible work touched ${args.touchedProjects.length} project${args.touchedProjects.length === 1 ? "" : "s"}: ` +
      `${args.touchedProjects.slice(0, 5).join(", ")}.`
    );
  }

  if (blockerPressure === "high") {
    summaryLines.push(
      `Blocker pressure was high, with ${args.blockerCount} blocker-related signals. Buddies should bias toward unblocking and narrowing focus.`
    );
  } else if (blockerPressure === "medium") {
    summaryLines.push(
      `There was moderate blocker pressure with ${args.blockerCount} blocker-related signals, suggesting some friction but continued movement.`
    );
  } else {
    summaryLines.push(
      `Blocker pressure stayed low, which suggests momentum was not dominated by unresolved issues.`
    );
  }

  if (decisionTempo === "high") {
    summaryLines.push(`Decision activity was high, which may indicate active shaping, tradeoffs, or execution pivots.`);
  } else if (decisionTempo === "moderate") {
    summaryLines.push(`Decision activity was moderate, with some meaningful directional choices made.`);
  } else {
    summaryLines.push(`Decision activity was low, which may mean execution outweighed strategy shifts this week.`);
  }

  if (strongestFocus) {
    summaryLines.push(`Primary recent focus appears to be ${strongestFocus}.`);
  }

  if (args.memorySignals.length > 0) {
    summaryLines.push(`Memory signals surfaced around: ${args.memorySignals.slice(0, 5).join(", ")}.`);
  }

  let suggestedNextMove = "Review cross-project priorities and identify the single most leverage-heavy next action.";

  if (blockerPressure === "high") {
    suggestedNextMove = "Run a blocker-clearing pass first. Resolve or re-scope the highest-friction items before expanding execution.";
  } else if (executionPace === "low") {
    suggestedNextMove = "Rebuild momentum with one sharply defined next action inside the current primary focus area.";
  } else if (args.touchedProjects.length >= 4) {
    suggestedNextMove = "Reduce spread. Too many concurrent touchpoints can dilute momentum. Pick one or two projects to push decisively.";
  } else if (decisionTempo === "high") {
    suggestedNextMove = "Stabilize around recent decisions and convert them into concrete work rather than opening more branches.";
  }

  return {
    execution_pace: executionPace,
    blocker_pressure: blockerPressure,
    decision_tempo: decisionTempo,
    strongest_focus: strongestFocus,
    suggested_next_move: suggestedNextMove,
    summary: summaryLines.join(" "),
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const since = daysAgoIso(7);

    const [
      { data: projects },
      { data: updates },
      { data: tasks },
      { data: decisions },
      { data: sessionMemory },
      { data: memoryItems },
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, status")
        .eq("user_id", user.id)
        .eq("status", "active"),

      supabase
        .from("project_updates")
        .select("project_id, update_type, content, created_at, projects(name)")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false }),

      supabase
        .from("project_tasks")
        .select("project_id, title, status, updated_at, created_at, projects(name)")
        .eq("user_id", user.id)
        .or(`updated_at.gte.${since},created_at.gte.${since}`)
        .order("updated_at", { ascending: false }),

      supabase
        .from("decisions")
        .select("project_id, context, verdict, created_at, projects(name)")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false }),

      supabase
        .from("ai_session_memory")
        .select("active_project, current_focus, key_topics, updated_at")
        .eq("user_id", user.id)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(10),

      supabase
        .from("ai_memory_items")
        .select("memory_type, content, keywords, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const activeProjects = (projects ?? []).map((p: any) => p.name).filter(Boolean);

    const touchedProjects = uniq([
      ...(updates ?? []).map((u: any) => u.projects?.name).filter(Boolean),
      ...(tasks ?? []).map((t: any) => t.projects?.name).filter(Boolean),
      ...(decisions ?? []).map((d: any) => d.projects?.name).filter(Boolean),
    ]);

    const blockerCount = (updates ?? []).filter(
      (u: any) => (u.update_type || "").toLowerCase() === "blocker"
    ).length;

    const sessionFocuses = uniq([
      ...(sessionMemory ?? []).map((m: any) => m.current_focus).filter(Boolean),
      ...(sessionMemory ?? []).map((m: any) => m.active_project).filter(Boolean),
    ]);

    const memorySignals = uniq([
      ...(memoryItems ?? []).map((m: any) => m.memory_type).filter(Boolean),
      ...(memoryItems ?? [])
        .flatMap((m: any) => Array.isArray(m.keywords) ? m.keywords : [])
        .filter(Boolean),
    ]);

    const pattern = buildSummary({
      activeProjects,
      touchedProjects,
      updateCount: (updates ?? []).length,
      blockerCount,
      taskCount: (tasks ?? []).length,
      decisionCount: (decisions ?? []).length,
      sessionFocuses,
      memorySignals,
    });

    return NextResponse.json({
      window_days: 7,
      active_projects: activeProjects,
      touched_projects: touchedProjects,
      stats: {
        updates: (updates ?? []).length,
        blockers: blockerCount,
        tasks_changed: (tasks ?? []).length,
        decisions: (decisions ?? []).length,
      },
      ...pattern,
    });
  } catch (error: any) {
    console.error("Activity patterns error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type SuggestionType = "pattern" | "nudge" | "insight" | "warning";
interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  message: string;
  action?: { label: string; data: Record<string, unknown> };
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ suggestions: [] });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: projects },
    { data: recentUpdates },
    { data: decisions },
    { data: logs },
    { data: staleTasks },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, updated_at").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("project_id, created_at").eq("user_id", user.id).gte("created_at", sevenDaysAgo),
    supabase.from("decisions").select("id, context, verdict, review_date, created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
    supabase.from("behavior_logs").select("mood_tag, stress, timestamp").eq("user_id", user.id).gte("timestamp", threeDaysAgo).order("timestamp", { ascending: false }),
    supabase.from("project_tasks").select("id, title, project_id, status, updated_at").eq("user_id", user.id).eq("status", "in_progress").lt("updated_at", fiveDaysAgo),
  ]);

  const suggestions: Suggestion[] = [];

  // ── Pattern 1: High stress / negative mood ────────────────────
  const negMoods = ["anxious", "frustrated", "angry", "fearful", "exhausted"];
  const badLogs = (logs ?? []).filter(l =>
    negMoods.includes(l.mood_tag ?? "") || (l.stress ?? 0) >= 7
  );
  if (badLogs.length >= 3) {
    suggestions.push({
      id: "stress-pattern",
      type: "pattern",
      title: `High stress pattern detected`,
      message: `You've logged exhaustion or stress 7+ a total of ${badLogs.length} times in the last 3 days. Consider reviewing your workload.`,
      action: { label: "Open Daily Check", data: { action: "navigate", href: "/app/daily-check" } },
    });
  } else if (badLogs.length >= 2) {
    const moods = badLogs.map(l => l.mood_tag).filter(Boolean);
    suggestions.push({
      id: "mood-pattern",
      type: "warning",
      title: "Mood pattern worth watching",
      message: `You've logged "${moods[0]}" and "${moods[1]}" in the last 3 days — watch your decision quality.`,
      action: { label: "Log Check-in", data: { action: "navigate", href: "/app/daily-check" } },
    });
  }

  // ── Pattern 2: Stale decisions ────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const pendingDecisions = (decisions ?? []).filter(d =>
    !d.verdict || d.verdict === "WAIT"
  );
  for (const d of pendingDecisions.slice(0, 2)) {
    const daysSince = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
    if (daysSince >= 3) {
      suggestions.push({
        id: `decision-${d.id}`,
        type: "nudge",
        title: `Decision waiting ${daysSince} days`,
        message: (d.context ?? "").slice(0, 100) + ((d.context?.length ?? 0) > 100 ? "…" : ""),
        action: { label: "Decide Now", data: { action: "navigate", href: "/app/decisions" } },
      });
    }
    // Overdue review
    if (d.review_date && d.review_date <= today && d.verdict) {
      suggestions.push({
        id: `review-${d.id}`,
        type: "nudge",
        title: "Decision review overdue",
        message: `Review date passed: "${(d.context ?? "").slice(0, 80)}…"`,
        action: { label: "Review", data: { action: "navigate", href: "/app/decisions" } },
      });
    }
  }

  // ── Pattern 3: Stale active projects ─────────────────────────
  const updatedProjectIds = new Set((recentUpdates ?? []).map(u => u.project_id));
  for (const p of (projects ?? [])) {
    const daysSince = Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000);
    if (!updatedProjectIds.has(p.id) && daysSince >= 7) {
      suggestions.push({
        id: `stale-project-${p.id}`,
        type: daysSince >= 14 ? "warning" : "insight",
        title: `${p.name} quiet for ${daysSince} days`,
        message: `No updates logged in over a week. Is this project blocked or deprioritised?`,
        action: { label: "Add Update", data: { action: "navigate", href: "/app/project-update" } },
      });
    }
  }

  // ── Pattern 4: Stale in-progress tasks ───────────────────────
  if ((staleTasks ?? []).length > 0) {
    suggestions.push({
      id: "stale-tasks",
      type: "insight",
      title: `${staleTasks!.length} task${staleTasks!.length > 1 ? "s" : ""} inactive for 5+ days`,
      message: "These in-progress tasks haven't moved. Worth a review to unblock or close them.",
      action: { label: "View Projects", data: { action: "navigate", href: "/app/projects" } },
    });
  }

  // ── Pattern 5: No recent check-ins ───────────────────────────
  if ((logs ?? []).length === 0) {
    suggestions.push({
      id: "no-checkin",
      type: "insight",
      title: "No check-ins in 3+ days",
      message: "Your behavioral data is going dark. A quick daily check-in keeps your AI context sharp.",
      action: { label: "Check In Now", data: { action: "navigate", href: "/app/daily-check" } },
    });
  }

  return NextResponse.json({
    suggestions: suggestions.slice(0, 5),
    generated_at: new Date().toISOString(),
  });
}

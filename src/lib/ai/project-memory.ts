type ProjectRow = {
  id: string;
  name: string;
  description?: string | null;
  memory?: string | null;
  status?: string | null;
};

type ProjectTask = {
  title?: string | null;
  status?: string | null;
  priority?: number | null;
  due_date?: string | null;
};

type ProjectUpdate = {
  content?: string | null;
  update_type?: string | null;
  next_actions?: string | null;
  created_at?: string | null;
};

type ProjectDecision = {
  title?: string | null;
  context?: string | null;
  verdict?: string | null;
  created_at?: string | null;
};

type ProjectRule = {
  rule_text?: string | null;
  severity?: number | null;
  active?: boolean | null;
};

type ProjectResearch = {
  topic?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

function uniq<T>(items: T[]) {
  return [...new Set(items)];
}

function compactText(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trim() + "…";
}

function inferStage(project: ProjectRow, updates: ProjectUpdate[], tasks: ProjectTask[]) {
  const lowerName = `${project.name} ${project.description || ""} ${project.memory || ""}`.toLowerCase();
  const updateTypes = updates.map((u) => (u.update_type || "").toLowerCase());

  if (project.status === "archived") return "archived";
  if (updateTypes.includes("blocker")) return "blocked";
  if (updateTypes.includes("milestone")) return "milestone";
  if (tasks.some((t) => (t.status || "").toLowerCase() === "in_progress")) return "active execution";
  if (lowerName.includes("refactor")) return "refactor";
  if (lowerName.includes("research")) return "research";
  if (lowerName.includes("launch")) return "launch prep";
  return project.status || "active";
}

export function buildProjectMemory(args: {
  project: ProjectRow;
  tasks?: ProjectTask[];
  updates?: ProjectUpdate[];
  decisions?: ProjectDecision[];
  rules?: ProjectRule[];
  research?: ProjectResearch[];
}) {
  const project = args.project;
  const tasks = args.tasks ?? [];
  const updates = args.updates ?? [];
  const decisions = args.decisions ?? [];
  const rules = (args.rules ?? []).filter((r) => r.active !== false);
  const research = args.research ?? [];

  const activeTaskTitles = tasks
    .filter((t) => ["todo", "in_progress", "open"].includes((t.status || "").toLowerCase()))
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
    .slice(0, 6)
    .map((t) => compactText(t.title || "", 120))
    .filter(Boolean);

  const blockerUpdates = updates
    .filter((u) => (u.update_type || "").toLowerCase() === "blocker")
    .slice(0, 5)
    .map((u) => compactText(u.content || "", 180));

  const recentDecisions = decisions
    .slice(0, 5)
    .map((d) => ({
      title: compactText(d.title || d.context || "decision", 120),
      verdict: d.verdict || "pending",
      created_at: d.created_at || null,
    }));

  const activeConstraints = rules
    .slice(0, 6)
    .map((r) => ({
      rule_text: compactText(r.rule_text || "", 140),
      severity: r.severity || 0,
    }));

  const nextActions = uniq(
    [
      ...updates
        .map((u) => compactText(u.next_actions || "", 140))
        .filter(Boolean),
      ...activeTaskTitles,
    ]
  ).slice(0, 6);

  const priorities = uniq(
    [
      ...activeTaskTitles.slice(0, 4),
      ...updates.slice(0, 4).map((u) => compactText(u.content || "", 120)).filter(Boolean),
    ]
  ).slice(0, 6);

  const researchTopics = research
    .slice(0, 4)
    .map((r) => compactText(r.topic || "", 80))
    .filter(Boolean);

  const currentStage = inferStage(project, updates, tasks);

  const purpose =
    compactText(
      project.description ||
      project.memory ||
      `Project "${project.name}" is an active workstream inside Buddies OS.`,
      260
    ) || null;

  const summaryParts = [
    purpose ? `Purpose: ${purpose}` : "",
    priorities.length ? `Priorities: ${priorities.join(" | ")}` : "",
    blockerUpdates.length ? `Blockers: ${blockerUpdates.join(" | ")}` : "",
    recentDecisions.length
      ? `Decisions: ${recentDecisions.map((d) => `${d.title} (${d.verdict})`).join(" | ")}`
      : "",
    nextActions.length ? `Next actions: ${nextActions.join(" | ")}` : "",
    researchTopics.length ? `Research: ${researchTopics.join(" | ")}` : "",
  ].filter(Boolean);

  return {
    project_name: project.name,
    purpose,
    current_stage: currentStage,
    active_priorities: priorities,
    open_blockers: blockerUpdates,
    key_decisions: recentDecisions,
    constraints: activeConstraints,
    next_actions: nextActions,
    summary_text: summaryParts.join("\n"),
    summary_json: {
      purpose,
      current_stage: currentStage,
      active_priorities: priorities,
      open_blockers: blockerUpdates,
      key_decisions: recentDecisions,
      constraints: activeConstraints,
      next_actions: nextActions,
      research_topics: researchTopics,
    },
  };
}

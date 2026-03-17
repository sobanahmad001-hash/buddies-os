"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  AlertTriangle,
  Info,
  AlertCircle,
  TrendingUp,
  CheckSquare,
  Brain,
  FolderKanban,
  FlaskConical,
  Plug,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ReactMarkdown from "react-markdown";

type Project = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  updateCount?: number;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: number | null;
  due_date: string | null;
  project_id: string;
};

type Insight = {
  summary: string;
  insight_type: string;
  domain: string;
  recommended_focus: string | null;
};

type Alert = {
  type: string;
  message: string;
  severity: "info" | "warn" | "alert";
};

type MemoryItem = {
  id: string;
  memory_type: string;
  content: string;
  severity?: number | null;
  created_at: string;
};

type SessionCompact = {
  current_focus?: string | null;
  summary?: string | null;
  key_topics?: string[] | null;
  updated_at?: string;
};

type ResearchSession = {
  id: string;
  topic: string;
  status: string;
  created_at: string;
};

type Integration = {
  id: string;
  name?: string | null;
  type: string;
  status: string;
};

type ActivityPatterns = {
  window_days: number;
  active_projects: string[];
  touched_projects: string[];
  stats: {
    updates: number;
    blockers: number;
    tasks_changed: number;
    decisions: number;
  };
  execution_pace: string;
  blocker_pressure: string;
  decision_tempo: string;
  strongest_focus: string | null;
  suggested_next_move: string;
  summary: string;
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AlertCard({ alert }: { alert: Alert }) {
  const cfg = {
    alert: { icon: AlertCircle, cls: "border-[#FEE2E2] bg-[#FEF2F2]", iconCls: "text-[#EF4444]" },
    warn: { icon: AlertTriangle, cls: "border-[#FEF9C3] bg-[#FEFCE8]", iconCls: "text-[#EAB308]" },
    info: { icon: Info, cls: "border-[#DBEAFE] bg-[#EFF6FF]", iconCls: "text-[#2C5F8A]" },
  }[alert.severity];

  const Icon = cfg.icon;

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${cfg.cls}`}>
      <Icon size={13} className={`${cfg.iconCls} shrink-0 mt-0.5`} />
      <p className="text-[12px] text-[#404040] leading-snug">{alert.message}</p>
    </div>
  );
}

function MomentumBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  const color = pct > 60 ? "#2D6A4F" : pct > 30 ? "#EAB308" : "#EF4444";

  return (
    <div className="w-full bg-[#F7F5F2] rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "bg-[#DCFCE7] text-[#2D6A4F]"
      : tone === "warn"
      ? "bg-[#FEF9C3] text-[#92400E]"
      : tone === "bad"
      ? "bg-[#FEE2E2] text-[#DC2626]"
      : "bg-[#F0EDE9] text-[#737373]";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [maxUpdates, setMaxUpdates] = useState(1);

  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [sessionCompact, setSessionCompact] = useState<SessionCompact | null>(null);
  const [researchSessions, setResearchSessions] = useState<ResearchSession[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [activityPatterns, setActivityPatterns] = useState<ActivityPatterns | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const [
        { data: proj },
        { data: ins },
        memoryRes,
        sessionRes,
        researchRes,
        integrationsRes,
        activityPatternsRes,
      ] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, status, updated_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false }),

        supabase
          .from("insights")
          .select("summary, insight_type, domain, recommended_focus")
          .eq("user_id", user.id)
          .order("generated_on", { ascending: false })
          .limit(4),

        supabase
          .from("ai_memory_items")
          .select("id, memory_type, content, severity, created_at")
          .eq("user_id", user.id)
          .in("memory_type", ["decision", "blocker", "next_step", "update"])
          .order("created_at", { ascending: false })
          .limit(12),

        supabase
          .from("ai_session_memory")
          .select("current_focus, summary, key_topics, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("research_sessions")
          .select("id, topic, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("integrations")
          .select("id, name, type, status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),

        fetch("/api/ai/activity-patterns").then(async (r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (proj) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const withCounts = await Promise.all(
          proj.map(async (p) => {
            const { count } = await supabase
              .from("project_updates")
              .select("*", { count: "exact", head: true })
              .eq("project_id", p.id)
              .gte("created_at", sevenDaysAgo);

            return { ...p, updateCount: count ?? 0 };
          })
        );

        const max = Math.max(...withCounts.map((p) => p.updateCount ?? 0), 1);
        setMaxUpdates(max);
        setProjects(withCounts);
      }

      setInsights(ins ?? []);
      setMemoryItems(memoryRes.data ?? []);
      setSessionCompact(sessionRes.data ?? null);
      setResearchSessions(researchRes.data ?? []);
      setIntegrations(integrationsRes.data ?? []);
      setActivityPatterns(activityPatternsRes ?? null);

      fetch("/api/ai/proactive")
        .then((r) => r.json())
        .then((data) => {
          setAlerts(data.insights ?? []);
          setAlertsLoading(false);
        })
        .catch(() => setAlertsLoading(false));

      fetch("/api/projects/tasks")
        .then((r) => r.json())
        .then((d) => setTasks((d.tasks ?? []).filter((t: Task) => t.status !== "done")))
        .catch(() => setTasks([]));
    }

    load();
  }, [router]);

  async function generateSummary() {
    setSummaryLoading(true);
    setShowSummary(true);

    const res = await fetch("/api/summary", { method: "POST" });
    const data = await res.json();
    setSummary(data.summary ?? "Failed to generate.");
    setSummaryLoading(false);
  }

  const tasksByProject: Record<string, { projectName: string; items: Task[] }> = {};
  tasks.forEach((t) => {
    const proj = projects.find((p) => p.id === t.project_id);
    const key = t.project_id ?? "unassigned";
    if (!tasksByProject[key]) {
      tasksByProject[key] = { projectName: proj?.name ?? "Unassigned", items: [] };
    }
    tasksByProject[key].items.push(t);
  });
  const taskGroups = Object.values(tasksByProject).sort((a, b) => b.items.length - a.items.length);

  const decisions = memoryItems.filter((m) => m.memory_type === "decision").slice(0, 4);
  const blockers = memoryItems.filter((m) => m.memory_type === "blocker").slice(0, 4);
  const nextSteps = memoryItems.filter((m) => m.memory_type === "next_step").slice(0, 5);

  const paceTone =
    activityPatterns?.execution_pace === "high"
      ? "good"
      : activityPatterns?.execution_pace === "steady"
      ? "warn"
      : activityPatterns?.execution_pace === "low"
      ? "bad"
      : "default";

  const blockerTone =
    activityPatterns?.blocker_pressure === "high"
      ? "bad"
      : activityPatterns?.blocker_pressure === "medium"
      ? "warn"
      : "good";

  const decisionTone =
    activityPatterns?.decision_tempo === "high"
      ? "warn"
      : activityPatterns?.decision_tempo === "moderate"
      ? "default"
      : "good";

  const activeIntegrationCount = integrations.filter((i) => i.status === "active").length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 md:p-8 max-w-[1100px]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[18px] font-semibold text-[#1A1A1A]">Dashboard</h1>
            <p className="text-[12px] text-[#737373] mt-0.5 hidden md:block">
              System view across momentum, memory, execution, and recent operating patterns
            </p>
          </div>

          <button
            onClick={generateSummary}
            disabled={summaryLoading}
            className="flex items-center gap-2 px-3 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] rounded-lg hover:border-[#CC785C] hover:text-[#CC785C] transition-colors disabled:opacity-50"
          >
            {summaryLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            <span>Weekly Digest</span>
          </button>
        </div>

        {showSummary && (
          <div className="bg-[#1A1A1A] rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-[#CC785C]" />
                <span className="text-[10px] font-semibold text-[#CC785C] uppercase tracking-wide">
                  Weekly Digest
                </span>
              </div>
              <button onClick={() => setShowSummary(false)} className="text-[11px] text-[#555] hover:text-[#999]">
                Close
              </button>
            </div>

            {summaryLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-[#CC785C]" />
                <span className="text-[12px] text-[#999]">Generating...</span>
              </div>
            ) : (
              <div className="text-[12px] text-[#CCC] leading-relaxed prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{summary}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {(alertsLoading || alerts.length > 0) && (
          <div className="mb-5 space-y-1.5">
            {alertsLoading ? (
              <div className="flex items-center gap-2 px-1">
                <Loader2 size={11} className="animate-spin text-[#737373]" />
                <span className="text-[11px] text-[#737373]">Checking signals...</span>
              </div>
            ) : (
              alerts.map((a, i) => <AlertCard key={i} alert={a} />)
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-4">
          <div className="space-y-4">
            <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={13} className="text-[#CC785C]" />
                <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Projects in Motion</h2>
                <span className="text-[10px] text-[#737373] ml-auto">7-day activity</span>
              </div>

              {projects.length === 0 ? (
                <p className="text-[12px] text-[#737373]">No active projects.</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => router.push(`/app/projects/${p.id}`)}
                      className="cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-[#404040] group-hover:text-[#CC785C] transition-colors">
                          {p.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#737373]">{p.updateCount ?? 0} updates</span>
                          <span className="text-[10px] text-[#737373]">{timeAgo(p.updated_at)}</span>
                        </div>
                      </div>
                      <MomentumBar value={p.updateCount ?? 0} max={maxUpdates} />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => router.push("/app/projects")}
                className="mt-3 text-[11px] text-[#CC785C] hover:underline"
              >
                All projects →
              </button>
            </div>

            <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare size={13} className="text-[#2C5F8A]" />
                <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Open Work</h2>
                <span className="text-[10px] text-[#737373] ml-auto">{tasks.length} open</span>
              </div>

              {taskGroups.length === 0 ? (
                <p className="text-[12px] text-[#737373]">No open tasks right now.</p>
              ) : (
                <div className="space-y-3">
                  {taskGroups.slice(0, 4).map((group) => (
                    <div key={group.projectName} className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] font-semibold text-[#1A1A1A]">{group.projectName}</p>
                        <span className="text-[10px] text-[#737373]">{group.items.length} items</span>
                      </div>
                      <div className="space-y-2">
                        {group.items.slice(0, 3).map((task) => (
                          <div key={task.id} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] mt-1.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] text-[#404040] leading-relaxed">{task.title}</p>
                              <p className="text-[10px] text-[#737373] mt-0.5">
                                priority {task.priority ?? 2}
                                {task.due_date ? ` · due ${task.due_date}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={13} className="text-[#7C3AED]" />
                  <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">
                    Recent Decisions and Blockers
                  </h2>
                </div>

                <div className="space-y-3">
                  {decisions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-2">Decisions</p>
                      <div className="space-y-2">
                        {decisions.map((d) => (
                          <div key={d.id} className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                            <p className="text-[12px] text-[#404040] leading-relaxed">{d.content}</p>
                            <p className="text-[10px] text-[#737373] mt-1">{timeAgo(d.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {blockers.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-2">Blockers</p>
                      <div className="space-y-2">
                        {blockers.map((b) => (
                          <div key={b.id} className="bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[12px] text-[#404040] leading-relaxed">{b.content}</p>
                              {b.severity ? <Pill tone="bad">sev {b.severity}</Pill> : null}
                            </div>
                            <p className="text-[10px] text-[#737373] mt-1">{timeAgo(b.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {decisions.length === 0 && blockers.length === 0 && (
                    <p className="text-[12px] text-[#737373]">No recent decision or blocker signals found.</p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={13} className="text-[#7C3AED]" />
                  <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">
                    Last 7 Days Pattern Summary
                  </h2>
                </div>

                {activityPatterns ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Pill tone={paceTone as any}>pace: {activityPatterns.execution_pace}</Pill>
                      <Pill tone={blockerTone as any}>blockers: {activityPatterns.blocker_pressure}</Pill>
                      <Pill tone={decisionTone as any}>decisions: {activityPatterns.decision_tempo}</Pill>
                    </div>

                    {activityPatterns.strongest_focus && (
                      <div>
                        <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-1">Strongest Focus</p>
                        <p className="text-[13px] text-[#1A1A1A]">{activityPatterns.strongest_focus}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-1">Summary</p>
                      <p className="text-[12px] text-[#404040] leading-relaxed">{activityPatterns.summary}</p>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-1">Suggested Next Move</p>
                      <p className="text-[12px] text-[#404040] leading-relaxed">{activityPatterns.suggested_next_move}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-[#FAF9F7] rounded-lg p-2">
                        <p className="text-[10px] text-[#737373]">Updates</p>
                        <p className="text-[14px] font-semibold text-[#1A1A1A]">{activityPatterns.stats.updates}</p>
                      </div>
                      <div className="bg-[#FAF9F7] rounded-lg p-2">
                        <p className="text-[10px] text-[#737373]">Tasks changed</p>
                        <p className="text-[14px] font-semibold text-[#1A1A1A]">{activityPatterns.stats.tasks_changed}</p>
                      </div>
                      <div className="bg-[#FAF9F7] rounded-lg p-2">
                        <p className="text-[10px] text-[#737373]">Blockers</p>
                        <p className="text-[14px] font-semibold text-[#1A1A1A]">{activityPatterns.stats.blockers}</p>
                      </div>
                      <div className="bg-[#FAF9F7] rounded-lg p-2">
                        <p className="text-[10px] text-[#737373]">Decisions</p>
                        <p className="text-[14px] font-semibold text-[#1A1A1A]">{activityPatterns.stats.decisions}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-[#737373]">Pattern summary unavailable right now.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRight size={13} className="text-[#CC785C]" />
                <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Assistant Suggestions</h2>
              </div>

              {nextSteps.length > 0 ? (
                <div className="space-y-2">
                  {nextSteps.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => router.push("/app/ai")}
                      className="w-full text-left bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3 hover:border-[#CC785C]/40 hover:bg-white transition-colors"
                    >
                      <p className="text-[12px] text-[#404040] leading-relaxed">{n.content}</p>
                      <p className="text-[10px] text-[#737373] mt-1">{timeAgo(n.created_at)}</p>
                    </button>
                  ))}
                </div>
              ) : sessionCompact?.current_focus || sessionCompact?.summary ? (
                <div className="space-y-2">
                  {sessionCompact?.current_focus && (
                    <div className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                      <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-1">Current Focus</p>
                      <p className="text-[12px] text-[#404040]">{sessionCompact.current_focus}</p>
                    </div>
                  )}
                  {sessionCompact?.summary && (
                    <div className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                      <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide mb-1">Session Compact</p>
                      <p className="text-[12px] text-[#404040] leading-relaxed">{sessionCompact.summary}</p>
                    </div>
                  )}
                  {sessionCompact?.key_topics && sessionCompact.key_topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sessionCompact.key_topics.slice(0, 6).map((topic, i) => (
                        <Pill key={i}>{topic}</Pill>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-[#737373]">No assistant suggestions yet.</p>
              )}
            </div>

            <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical size={13} className="text-[#2C5F8A]" />
                <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">
                  Research and Integrations Snapshot
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Research</p>
                    <button onClick={() => router.push("/app/research")} className="text-[11px] text-[#CC785C] hover:underline">
                      Open →
                    </button>
                  </div>

                  {researchSessions.length > 0 ? (
                    <div className="space-y-2">
                      {researchSessions.slice(0, 3).map((r) => (
                        <div key={r.id} className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] text-[#404040] leading-relaxed">{r.topic}</p>
                            <Pill>{r.status}</Pill>
                          </div>
                          <p className="text-[10px] text-[#737373] mt-1">{timeAgo(r.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#737373]">No recent research sessions.</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Integrations</p>
                    <button onClick={() => router.push("/app/integrations")} className="text-[11px] text-[#CC785C] hover:underline">
                      Open →
                    </button>
                  </div>

                  <div className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Plug size={12} className="text-[#737373]" />
                      <p className="text-[12px] text-[#404040]">
                        {activeIntegrationCount} active integration{activeIntegrationCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    {integrations.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {integrations.slice(0, 6).map((i) => (
                          <Pill key={i.id}>{i.name || i.type}</Pill>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#737373]">No integrations connected.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {insights.length > 0 && (
              <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={13} className="text-[#7C3AED]" />
                  <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">System Insights</h2>
                </div>

                <div className="space-y-2">
                  {insights.slice(0, 4).map((insight, i) => (
                    <div key={i} className="bg-[#FAF9F7] border border-[#EDE8E2] rounded-xl p-3">
                      <p className="text-[12px] text-[#404040] leading-relaxed">{insight.summary}</p>
                      {insight.recommended_focus ? (
                        <p className="text-[10px] text-[#737373] mt-1">focus: {insight.recommended_focus}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

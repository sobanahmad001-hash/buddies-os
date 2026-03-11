"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, AlertTriangle, Info, AlertCircle, TrendingUp, Scale, Brain, Activity, CheckSquare, Users, FolderKanban, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ReactMarkdown from "react-markdown";

type Project = { id: string; name: string; status: string; updated_at: string; updateCount?: number; };
type Task = { id: string; title: string; status: string; priority: number | null; due_date: string | null; project_id: string; };
type ActivityItem = { id: string; kind: "update" | "task"; content: string; update_type: string | null; project: string | null; project_id: string | null; created_at: string; is_own: boolean; author: string; };
type Decision = { id: string; context: string; verdict: string | null; probability: number | null; created_at: string; closed_at: string | null; review_date: string | null; };
type Insight = { summary: string; insight_type: string; domain: string; recommended_focus: string | null; strength?: string; confidence_score?: number; supporting_records?: number; time_window?: string; };
type Alert = { type: string; message: string; severity: "info" | "warn" | "alert" };

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }
function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

function AlertCard({ alert }: { alert: Alert }) {
  const cfg = { alert: { icon: AlertCircle, cls: "border-[#FEE2E2] bg-[#FEF2F2]", iconCls: "text-[#EF4444]" }, warn: { icon: AlertTriangle, cls: "border-[#FEF9C3] bg-[#FEFCE8]", iconCls: "text-[#EAB308]" }, info: { icon: Info, cls: "border-[#DBEAFE] bg-[#EFF6FF]", iconCls: "text-[#2C5F8A]" } }[alert.severity];
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
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  
  const [ankaStats, setAnkaStats] = useState<{dept: string; slug: string; color: string; inProgress: number; todo: number; bugs: number; campaigns: number}[]>([]);

const [projects, setProjects] = useState<Project[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [focusRecs, setFocusRecs] = useState<any[]>([]);
  const [cognitiveData, setCognitiveData] = useState<{ score: number; trend: string; avgAccuracy: number | null } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamActivity, setTeamActivity] = useState<ActivityItem[]>([]);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [maxUpdates, setMaxUpdates] = useState(1);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [{ data: proj }, { data: dec }, { data: ins }, { data: behavLogs }] = await Promise.all([
        supabase.from("projects").select("id, name, status, updated_at").eq("user_id", user.id).eq("status", "active").order("updated_at", { ascending: false }),
        supabase.from("decisions").select("id, context, verdict, probability, created_at, closed_at, review_date").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("insights").select("summary, insight_type, domain, recommended_focus").eq("user_id", user.id).order("generated_on", { ascending: false }).limit(4),
        supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(7),
      ]);

      // Get update counts per project for momentum
      if (proj) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const withCounts = await Promise.all(proj.map(async p => {
          const { count } = await supabase.from("project_updates").select("*", { count: "exact", head: true }).eq("project_id", p.id).gte("created_at", sevenDaysAgo);
          return { ...p, updateCount: count ?? 0 };
        }));
        const max = Math.max(...withCounts.map(p => p.updateCount ?? 0), 1);
        setMaxUpdates(max);
        setProjects(withCounts);
      }

      setDecisions(dec ?? []);
      setInsights(ins ?? []);
      setLogs(behavLogs ?? []);

      // Load alerts
      fetch("/api/ai/proactive").then(r => r.json()).then(data => {
        setAlerts(data.insights ?? []);
        setAlertsLoading(false);
      }).catch(() => setAlertsLoading(false));

      // Load open tasks and team activity in parallel
      fetch("/api/projects/tasks").then(r => r.json()).then(d => setTasks((d.tasks ?? []).filter((t: Task) => t.status !== "done")));
      fetch("/api/workspace/activity").then(r => r.json()).then(d => { setTeamActivity(d.updates ?? []); if (d.workspaceName) setWorkspaceName(d.workspaceName); });

      // Generate fresh insights if we have behavior data
      if (behavLogs && behavLogs.length >= 3 && ins && ins.length === 0) {
        fetch("/api/ai/insights", { method: "POST" }).then(r => r.json()).then(() => {
          supabase.from("insights").select("summary, insight_type, domain, recommended_focus").eq("user_id", user.id).order("generated_on", { ascending: false }).limit(4).then(({ data }) => setInsights(data ?? []));
        });
      }
    }
    load();    loadCognitive();  }, []);

  async function loadCognitive() {
    const predRes = await fetch("/api/ai/predictions");
    const predData = await predRes.json();
    setPredictions(predData.predictions ?? []);

    const logRes = await fetch("/api/daily-check?limit=5");
    if (logRes.ok) {
      const logData = await logRes.json();
      const recentLogs = logData.logs ?? [];
      if (recentLogs.length > 0) {
        const latest = recentLogs[0];
        const trend = recentLogs.length > 1
          ? (recentLogs[0].cognitive_score > recentLogs[1].cognitive_score ? "up" : "down")
          : "stable";
        setCognitiveData({ score: latest.cognitive_score ?? 0, trend, avgAccuracy: null });
      }
    }
  }

  async function generateSummary() {
    setSummaryLoading(true); setShowSummary(true);
    const res = await fetch("/api/summary", { method: "POST" });
    const data = await res.json();
    setSummary(data.summary ?? "Failed to generate.");
    setSummaryLoading(false);
  }

  const today = new Date().toISOString().split("T")[0];
  const reviewDue = decisions.filter(d => d.review_date && d.review_date <= today && !d.closed_at);
  const avgStress = logs.length ? Math.round(logs.reduce((a, l) => a + (l.stress ?? 0), 0) / logs.length * 10) / 10 : null;
  const avgSleep = logs.length ? Math.round(logs.reduce((a, l) => a + (Number(l.sleep_hours) ?? 0), 0) / logs.length * 10) / 10 : null;
  const recentMoods = logs.slice(0, 3).map(l => l.mood_tag).filter(Boolean);

  // Group open tasks by project
  const tasksByProject: Record<string, { projectName: string; items: Task[] }> = {};
  tasks.forEach(t => {
    const proj = projects.find(p => p.id === t.project_id);
    const key = t.project_id ?? "unassigned";
    if (!tasksByProject[key]) tasksByProject[key] = { projectName: proj?.name ?? "Unassigned", items: [] };
    tasksByProject[key].items.push(t);
  });
  const taskGroups = Object.values(tasksByProject).sort((a, b) => b.items.length - a.items.length);


  useEffect(() => {
    async function loadAnkaStats() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
      if (!ws) return;
      const { data: depts } = await supabase.from("departments").select("*").eq("workspace_id", ws.id);
      if (!depts) return;
      const stats = await Promise.all(depts.map(async (d: any) => {
        const [tRes, aRes] = await Promise.all([
          supabase.from("project_tasks").select("status").eq("department_id", d.id).neq("status", "cancelled"),
          supabase.from("department_activity").select("activity_type").eq("department_id", d.id),
        ]);
        const tasks = tRes.data ?? [];
        const activity = aRes.data ?? [];
        const colorMap: Record<string,string> = { design: "#8B5CF6", development: "#3B82F6", marketing: "#10B981" };
        return {
          dept: d.name, slug: d.slug, color: colorMap[d.slug] ?? "#E8521A",
          inProgress: tasks.filter((t: any) => t.status === "in_progress").length,
          todo: tasks.filter((t: any) => t.status === "todo").length,
          bugs: activity.filter((a: any) => a.activity_type === "bug").length,
          campaigns: activity.filter((a: any) => a.activity_type === "campaign").length,
        };
      }));
      setAnkaStats(stats);
    }
    loadAnkaStats();
  }, []);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 md:p-8 max-w-[1100px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[18px] font-semibold text-[#1A1A1A]">Dashboard</h1>
            <p className="text-[12px] text-[#737373] mt-0.5 hidden md:block">Capture → Understand → Analyze → Suggest → You decide</p>
          </div>
          <button onClick={generateSummary} disabled={summaryLoading}
            className="flex items-center gap-2 px-3 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] rounded-lg hover:border-[#CC785C] hover:text-[#CC785C] transition-colors disabled:opacity-50">
            {summaryLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            <span>Weekly Digest</span>
          </button>
        </div>

        {/* Weekly summary */}
        {showSummary && (
          <div className="bg-[#1A1A1A] rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Sparkles size={12} className="text-[#CC785C]" /><span className="text-[10px] font-semibold text-[#CC785C] uppercase tracking-wide">Weekly Digest</span></div>
              <button onClick={() => setShowSummary(false)} className="text-[11px] text-[#555] hover:text-[#999]">Close</button>
            </div>
            {summaryLoading
              ? <div className="flex items-center gap-2"><Loader2 size={12} className="animate-spin text-[#CC785C]" /><span className="text-[12px] text-[#999]">Generating...</span></div>
              : <div className="text-[12px] text-[#CCC] leading-relaxed prose prose-sm prose-invert max-w-none"><ReactMarkdown>{summary}</ReactMarkdown></div>
            }
          </div>
        )}

        {/* Alerts */}
        {(alertsLoading || alerts.length > 0) && (
          <div className="mb-5 space-y-1.5">
            {alertsLoading
              ? <div className="flex items-center gap-2 px-1"><Loader2 size={11} className="animate-spin text-[#737373]" /><span className="text-[11px] text-[#737373]">Checking signals...</span></div>
              : alerts.map((a, i) => <AlertCard key={i} alert={a} />)
            }
          </div>
        )}

        {/* 4 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* PILLAR 1: Project Momentum */}
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-[#CC785C]" />
              <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Project Momentum</h2>
              <span className="text-[10px] text-[#737373] ml-auto">7-day activity</span>
            </div>
            {projects.length === 0
              ? <p className="text-[12px] text-[#737373]">No active projects.</p>
              : <div className="space-y-3">
                  {projects.map(p => (
                    <div key={p.id} onClick={() => router.push(`/app/projects/${p.id}`)} className="cursor-pointer group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-[#404040] group-hover:text-[#CC785C] transition-colors">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#737373]">{p.updateCount ?? 0} updates</span>
                          <span className="text-[10px] text-[#737373]">{timeAgo(p.updated_at)}</span>
                        </div>
                      </div>
                      <MomentumBar value={p.updateCount ?? 0} max={maxUpdates} />
                    </div>
                  ))}
                </div>
            }
            <button onClick={() => router.push("/app/projects")} className="mt-3 text-[11px] text-[#CC785C] hover:underline">All projects →</button>
          </div>

          {/* PILLAR 2: Decision Review */}
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Scale size={13} className="text-[#2C5F8A]" />
              <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Decision Review</h2>
              {reviewDue.length > 0 && <span className="ml-auto text-[10px] font-semibold text-[#EF4444]">{reviewDue.length} overdue</span>}
            </div>
            {decisions.length === 0
              ? <p className="text-[12px] text-[#737373]">No decisions logged yet.</p>
              : <div className="space-y-2">
                  {decisions.slice(0, 4).map(d => (
                    <div key={d.id} onClick={() => router.push("/app/decisions")}
                      className="flex items-center gap-2 cursor-pointer hover:bg-[#FAF9F7] rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.closed_at ? "bg-[#2D6A4F]" : d.review_date && d.review_date <= today ? "bg-[#EF4444]" : "bg-[#EAB308]"}`} />
                      <p className="text-[12px] text-[#404040] flex-1 truncate">{d.context}</p>
                      <span className="text-[10px] text-[#737373] shrink-0">{timeAgo(d.created_at)}</span>
                    </div>
                  ))}
                </div>
            }
            <button onClick={() => router.push("/app/decisions")} className="mt-3 text-[11px] text-[#CC785C] hover:underline">Review all →</button>
          </div>

          {/* PILLAR 3: Behavioral Trends */}
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-[#7C3AED]" />
              <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Behavioral Trends</h2>
              <span className="text-[10px] text-[#737373] ml-auto">last 7 logs</span>
            </div>
            {logs.length === 0
              ? <div><p className="text-[12px] text-[#737373] mb-2">No behavior data yet.</p><button onClick={() => router.push("/app/daily-check")} className="text-[11px] text-[#CC785C] hover:underline">Log today →</button></div>
              : <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#F7F5F2] rounded-lg p-3 text-center">
                      <p className="text-[18px] font-bold text-[#1A1A1A]">{avgSleep ?? "—"}h</p>
                      <p className="text-[10px] text-[#737373] mt-0.5">avg sleep</p>
                    </div>
                    <div className="bg-[#F7F5F2] rounded-lg p-3 text-center">
                      <p className={`text-[18px] font-bold ${(avgStress ?? 0) >= 7 ? "text-[#EF4444]" : (avgStress ?? 0) >= 5 ? "text-[#EAB308]" : "text-[#2D6A4F]"}`}>{avgStress ?? "—"}/10</p>
                      <p className="text-[10px] text-[#737373] mt-0.5">avg stress</p>
                    </div>
                  </div>
                  {recentMoods.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#737373] mb-1">Recent moods</p>
                      <div className="flex gap-1 flex-wrap">
                        {recentMoods.map((m, i) => <span key={i} className="text-[11px] bg-[#EDE9FE] text-[#7C3AED] px-2 py-0.5 rounded-full capitalize">{m}</span>)}
                      </div>
                    </div>
                  )}
                </div>
            }
            <button onClick={() => router.push("/app/daily-check")} className="mt-3 text-[11px] text-[#CC785C] hover:underline">Log today →</button>
          </div>

          {/* Cognitive State */}
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={13} className="text-[#7C3AED]" />
              <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Cognitive State</h2>
            </div>
            {cognitiveData ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[28px] font-bold text-[#1A1A1A] leading-none">{cognitiveData.score}<span className="text-[11px] text-[#737373] ml-1">/100</span></div>
                    <div className="text-[10px] text-[#737373] mt-0.5">Current cognitive score</div>
                  </div>
                  <div className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                    cognitiveData.score >= 70 ? "bg-[#DCFCE7] text-[#2D6A4F]" :
                    cognitiveData.score >= 45 ? "bg-[#FEF9C3] text-[#92400E]" :
                    "bg-[#FEE2E2] text-[#EF4444]"
                  }`}>
                    {cognitiveData.score >= 70 ? "Sharp" : cognitiveData.score >= 45 ? "Moderate" : "Low"}
                  </div>
                </div>
                <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      cognitiveData.score >= 70 ? "bg-[#2D6A4F]" :
                      cognitiveData.score >= 45 ? "bg-[#F59E0B]" :
                      "bg-[#EF4444]"
                    }`}
                    style={{ width: `${cognitiveData.score}%` }}
                  />
                </div>
                {predictions.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#737373] uppercase tracking-wide font-semibold">Active Alerts</p>
                    {predictions.map((p: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 px-2.5 py-2 bg-[#FEFCE8] border border-[#FDE68A] rounded-lg">
                        <span className="text-[#F59E0B] mt-0.5 text-[11px]">⚡</span>
                        <div className="flex-1">
                          <p className="text-[11px] text-[#92400E] leading-snug">{p.predicted_outcome}</p>
                          <p className="text-[10px] text-[#B45309] mt-0.5">{Math.round(p.confidence * 100)}% confidence · {p.based_on_records} records</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-[#737373] text-center py-1">No active alerts — all signals clear</p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-[#737373]">Log a daily check-in to activate cognitive tracking.</p>
            )}
          </div>

          {/* PILLAR 4: AI Insights */}
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={13} className="text-[#CC785C]" />
              <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">AI Insights</h2>
              <span className="text-[10px] text-[#737373] ml-auto">pattern analysis</span>
            </div>
            {insights.length === 0
              ? <div>
                  <p className="text-[12px] text-[#737373] mb-2">Log 3+ daily check-ins to unlock pattern analysis.</p>
                  <div className="space-y-1.5">
                    {["sleep vs decision quality", "stress vs project momentum", "mood vs update frequency"].map(p => (
                      <div key={p} className="flex items-center gap-2 px-3 py-2 bg-[#F7F5F2] rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E5E2DE]" />
                        <p className="text-[11px] text-[#737373] italic">{p}</p>
                      </div>
                    ))}
                  </div>
                </div>
              : <div className="space-y-2">
                  {insights.map((ins, i) => (
                    <div key={i} className="px-3 py-2.5 bg-[#FAF9F7] border border-[#E5E2DE] rounded-lg">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <p className="text-[10px] font-semibold text-[#CC785C] uppercase tracking-wide">{ins.domain} · {ins.insight_type}</p>
                        {ins.strength && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            ins.strength === "strong" ? "bg-[#DCFCE7] text-[#2D6A4F]" :
                            ins.strength === "moderate" ? "bg-[#FEF9C3] text-[#92400E]" :
                            "bg-[#F3F4F6] text-[#737373]"
                          }`}>{ins.strength}</span>
                        )}
                        {ins.confidence_score != null && (
                          <span className="text-[10px] text-[#737373]">{Math.round(ins.confidence_score * 100)}% conf · {ins.supporting_records ?? "?"} records</span>
                        )}
                        {ins.time_window && <span className="text-[10px] text-[#737373]">{ins.time_window}</span>}
                      </div>
                      <p className="text-[12px] text-[#404040] leading-snug">{ins.summary}</p>
                      {ins.recommended_focus && <p className="text-[11px] text-[#737373] mt-1 italic">→ {ins.recommended_focus}</p>}
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── PENDING TASKS BY PROJECT ───────────────────────────── */}
        {taskGroups.length > 0 && (
          <div className="mt-4 bg-white border border-[#E5E2DE] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare size={13} className="text-[#E8521A]" />
              <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">Pending Tasks</h2>
              <span className="text-[10px] text-[#737373] ml-auto">{tasks.length} open</span>
            </div>
            <div className="space-y-4">
              {taskGroups.map(group => (
                <div key={group.projectName}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <FolderKanban size={11} className="text-[#737373]" />
                    <span className="text-[11px] font-semibold text-[#404040]">{group.projectName}</span>
                    <span className="text-[10px] text-[#737373] bg-[#F7F5F2] px-1.5 py-0.5 rounded-full">{group.items.length}</span>
                  </div>
                  <div className="space-y-1 pl-4">
                    {group.items.map(t => (
                      <div key={t.id} className="flex items-center gap-2.5 py-1.5 border-b border-[#F7F5F2] last:border-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${t.status === "in_progress" ? "bg-[#EAB308]" : "bg-[#D4D4D4]"}`} />
                        <p className="text-[12px] text-[#404040] flex-1">{t.title}</p>
                        {t.due_date && (
                          <span className={`text-[10px] font-medium shrink-0 ${new Date(t.due_date) < new Date() ? "text-[#EF4444]" : "text-[#737373]"}`}>
                            {new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                          t.status === "in_progress" ? "bg-[#FEF9C3] text-[#92400E]" : "bg-[#F3F4F6] text-[#737373]"
                        } capitalize`}>{t.status === "in_progress" ? "In Progress" : "To Do"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TEAM / AGENT ACTIVITY FEED ─────────────────────────── */}
        <div className="mt-4 bg-white border border-[#E5E2DE] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={13} className="text-[#2C5F8A]" />
            <h2 className="text-[12px] font-semibold text-[#1A1A1A] uppercase tracking-wide">
              {workspaceName ? `${workspaceName} Activity` : "Recent Activity"}
            </h2>
            <span className="text-[10px] text-[#737373] ml-auto">updates · tasks</span>
          </div>
          {teamActivity.length === 0 ? (
            <p className="text-[12px] text-[#737373]">No activity yet. Start logging updates or tasks from the AI Assistant.</p>
          ) : (
            <div className="space-y-0">
              {teamActivity.slice(0, 15).map(item => (
                <div key={item.id} className="flex items-start gap-3 py-2.5 border-b border-[#F7F5F2] last:border-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${item.is_own ? "bg-[#E8521A] text-white" : "bg-[#DBEAFE] text-[#2C5F8A]"}`}>
                    {(item.author || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-[#1A1A1A]">{item.is_own ? "You" : item.author}</span>
                      <span className="text-[11px] text-[#737373]">
                        {item.kind === "task" ? "added task" : `logged ${item.update_type ?? "update"}`}
                      </span>
                      {item.project && (
                        <>
                          <span className="text-[11px] text-[#737373]">in</span>
                          <span className="text-[11px] font-medium text-[#404040]">{item.project}</span>
                        </>
                      )}
                    </div>
                    <p className="text-[12px] text-[#404040] truncate mt-0.5">{item.content}</p>
                  </div>
                  <span className="text-[10px] text-[#737373] shrink-0 mt-0.5">{timeAgo(item.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Command */}
        <div className="mt-5 pt-4 border-t border-[#E5E2DE]">
          <span className="text-[10px] text-[#737373] uppercase tracking-wide mb-2 block">Quick Entry</span>
          <div className="flex gap-2">
            <input className="flex-1 border border-[#E5E2DE] rounded-xl px-4 py-2.5 text-[13px] bg-white focus:outline-none focus:border-[#CC785C]/50 placeholder:text-[#999]"
              placeholder="Log anything — sent to AI Assistant..."
              value={commandInput} onChange={e => setCommandInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && commandInput.trim()) router.push(`/app/ai?q=${encodeURIComponent(commandInput)}`); }} />
            <button onClick={() => commandInput.trim() && router.push(`/app/ai?q=${encodeURIComponent(commandInput)}`)}
              className="bg-[#1A1A1A] text-white text-[13px] px-4 py-2.5 rounded-xl hover:bg-[#333] transition-colors">→</button>
          </div>
        </div>

        {/* ANKA Team Card */}
        {ankaStats.length > 0 && (
          <Link href="/app/workspace" className="block">
            <div className="bg-[#0F0F0F] rounded-2xl p-5 hover:bg-[#1A1A1A] transition-colors cursor-pointer group">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-white font-bold text-sm tracking-tight">ANKA <span className="text-[#E8521A]">SPHERE</span></div>
                  <div className="text-[#525252] text-[10px]">Team pulse</div>
                </div>
                <ChevronRight size={14} className="text-[#525252] group-hover:text-white transition-colors" />
              </div>
              <div className="space-y-2.5">
                {ankaStats.map(s => (
                  <div key={s.slug} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <div className="flex-1 text-[11px] text-[#8A8A8A]">{s.dept}</div>
                    <div className="flex items-center gap-3 text-[10px]">
                      {s.inProgress > 0 && <span style={{ color: s.color }}>{s.inProgress} active</span>}
                      {s.todo > 0 && <span className="text-[#525252]">{s.todo} queued</span>}
                      {s.bugs > 0 && <span className="text-red-400">{s.bugs} bugs</span>}
                      {s.campaigns > 0 && <span className="text-[#10B981]">{s.campaigns} campaigns</span>}
                      {s.inProgress === 0 && s.todo === 0 && <span className="text-[#3A3A3A]">no activity</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

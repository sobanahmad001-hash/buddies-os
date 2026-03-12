"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart2, Calendar, CheckSquare, ChevronDown, Plus,
  TrendingUp, TrendingDown, Minus, Trash2, X, ChevronRight,
} from "lucide-react";

const ACCENT = "#E8521A";

const PRIORITY_COLORS: Record<string, string> = {
  high: "#EF4444", medium: "#F59E0B", low: "#10B981",
};
const TASK_STATUS_COLORS: Record<string, string> = {
  in_progress: "#3B82F6", completed: "#10B981", cancelled: "#EF4444", blocked: "#F59E0B",
};
const CAL_STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B", published: "#10B981", cancelled: "#EF4444",
};

type SeoMetric   = { id: string; keyword: string; ranking: number | null; url: string | null; date: string };
type CalEvent    = { id: string; title: string; content_type: string; platform: string | null; scheduled_date: string; status: string; notes: string | null };
type MarketTask  = { id: string; task_description: string; assigned_to: string | null; due_date: string | null; status: string; priority: string; category: string | null };

export default function MarketingDashboard() {
  const [clients,  setClients]  = useState<any[]>([]);
  const [selClient, setSelClient] = useState<any>(null);
  const [dropOpen, setDropOpen] = useState(false);

  const [seoMetrics,  setSeoMetrics]  = useState<SeoMetric[]>([]);
  const [calEvents,   setCalEvents]   = useState<CalEvent[]>([]);
  const [tasks,       setTasks]       = useState<MarketTask[]>([]);

  const [tab, setTab] = useState<"seo" | "calendar" | "tasks">("seo");
  const [loading, setLoading] = useState(false);

  // SEO form
  const [newSeo,  setNewSeo]  = useState({ keyword: "", ranking: "", url: "" });
  const [showSeoForm, setShowSeoForm] = useState(false);

  // Calendar form
  const [newCal, setNewCal] = useState({ title: "", content_type: "blog", platform: "", scheduled_date: "", notes: "" });
  const [showCalForm, setShowCalForm] = useState(false);

  // Task form
  const [newTask, setNewTask] = useState({ task_description: "", due_date: "", priority: "medium", category: "" });
  const [showTaskForm, setShowTaskForm] = useState(false);

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    const res = await fetch("/api/clients");
    const j   = await res.json();
    setClients(j.clients ?? []);
    if ((j.clients ?? []).length) {
      handleSelectClient((j.clients as any[])[0]);
    }
  }

  async function handleSelectClient(client: any) {
    setSelClient(client);
    setDropOpen(false);
    setLoading(true);
    await Promise.all([
      loadSeo(client.id),
      loadCalendar(client.id),
      loadTasks(client.id),
    ]);
    setLoading(false);
  }

  async function loadSeo(clientId: string) {
    const res = await fetch(`/api/marketing/seo?client_id=${clientId}`);
    const j   = await res.json();
    setSeoMetrics(j.metrics ?? []);
  }

  async function loadCalendar(clientId: string) {
    const res = await fetch(`/api/marketing/calendar?client_id=${clientId}`);
    const j   = await res.json();
    setCalEvents(j.events ?? []);
  }

  async function loadTasks(clientId: string) {
    const res = await fetch(`/api/marketing/tasks?client_id=${clientId}`);
    const j   = await res.json();
    setTasks(j.tasks ?? []);
  }

  // ---------- SEO actions ----------
  async function addSeoMetric() {
    if (!newSeo.keyword.trim() || !selClient) return;
    const res = await fetch("/api/marketing/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: selClient.id, keyword: newSeo.keyword, ranking: newSeo.ranking ? Number(newSeo.ranking) : null, url: newSeo.url || null }),
    });
    if (res.ok) { setNewSeo({ keyword: "", ranking: "", url: "" }); setShowSeoForm(false); await loadSeo(selClient.id); }
  }

  async function deleteSeo(id: string) {
    await fetch("/api/marketing/seo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setSeoMetrics(m => m.filter(x => x.id !== id));
  }

  // ---------- Calendar actions ----------
  async function addCalEvent() {
    if (!newCal.title.trim() || !newCal.scheduled_date || !selClient) return;
    const res = await fetch("/api/marketing/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: selClient.id, ...newCal, platform: newCal.platform || null, notes: newCal.notes || null }),
    });
    if (res.ok) { setNewCal({ title: "", content_type: "blog", platform: "", scheduled_date: "", notes: "" }); setShowCalForm(false); await loadCalendar(selClient.id); }
  }

  async function updateCalStatus(id: string, status: string) {
    await fetch("/api/marketing/calendar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setCalEvents(e => e.map(ev => ev.id === id ? { ...ev, status } : ev));
  }

  async function deleteCal(id: string) {
    await fetch("/api/marketing/calendar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setCalEvents(e => e.filter(x => x.id !== id));
  }

  // ---------- Task actions ----------
  async function addTask() {
    if (!newTask.task_description.trim() || !selClient) return;
    const res = await fetch("/api/marketing/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: selClient.id, ...newTask, due_date: newTask.due_date || null, category: newTask.category || null }),
    });
    if (res.ok) { setNewTask({ task_description: "", due_date: "", priority: "medium", category: "" }); setShowTaskForm(false); await loadTasks(selClient.id); }
  }

  async function updateTaskStatus(id: string, status: string) {
    await fetch("/api/marketing/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    setTasks(t => t.map(x => x.id === id ? { ...x, status } : x));
  }

  async function deleteTask(id: string) {
    await fetch("/api/marketing/tasks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setTasks(t => t.filter(x => x.id !== id));
  }

  const rankIcon = (r: number | null) => {
    if (r === null) return <Minus size={13} className="text-[#B0ADA9]" />;
    if (r <= 3)  return <TrendingUp size={13} style={{ color: "#10B981" }} />;
    if (r <= 10) return <TrendingUp size={13} style={{ color: "#F59E0B" }} />;
    return <TrendingDown size={13} style={{ color: "#EF4444" }} />;
  };

  const TABS = [
    { key: "seo",      label: "SEO Metrics",      icon: <BarChart2 size={14} /> },
    { key: "calendar", label: "Content Calendar",  icon: <Calendar  size={14} /> },
    { key: "tasks",    label: "Marketing Tasks",   icon: <CheckSquare size={14} /> },
  ] as const;

  return (
    <div className="min-h-screen" style={{ background: "#0F0F0F", color: "#F7F5F2" }}>
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-[15px] font-semibold tracking-tight">Marketing Dashboard</h1>

        {/* Client selector */}
        <div className="relative">
          <button
            onClick={() => setDropOpen(o => !o)}
            className="flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-xl border border-white/10 hover:border-white/20 transition-colors"
            style={{ background: "#1A1A1A" }}
          >
            <span className="max-w-[160px] truncate">{selClient ? selClient.name : "Select client"}</span>
            <ChevronDown size={13} className="text-[#B0ADA9]" />
          </button>
          {dropOpen && (
            <div
              className="absolute right-0 mt-1 z-50 rounded-xl border border-white/10 overflow-hidden w-56 shadow-xl"
              style={{ background: "#1A1A1A" }}
            >
              {clients.length === 0 && (
                <p className="text-[12px] text-[#B0ADA9] px-4 py-3">No clients found</p>
              )}
              {clients.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectClient(c)}
                  className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-white/5 transition-colors truncate"
                  style={{ color: selClient?.id === c.id ? ACCENT : "#F7F5F2" }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!selClient ? (
        <div className="flex items-center justify-center h-64 text-[#B0ADA9] text-[13px]">
          Select a client to view marketing data
        </div>
      ) : (
        <div className="px-6 py-6 max-w-5xl mx-auto">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "SEO Keywords",    value: seoMetrics.length, sub: `${seoMetrics.filter(m => (m.ranking ?? 99) <= 10).length} in top 10` },
              { label: "Content Planned", value: calEvents.filter(e => e.status === "pending").length, sub: `${calEvents.filter(e => e.status === "published").length} published` },
              { label: "Active Tasks",    value: tasks.filter(t => t.status === "in_progress").length, sub: `${tasks.filter(t => t.status === "completed").length} completed` },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/10 p-4" style={{ background: "#1A1A1A" }}>
                <p className="text-[11px] text-[#B0ADA9] mb-1">{s.label}</p>
                <p className="text-[22px] font-semibold">{s.value}</p>
                <p className="text-[11px] text-[#B0ADA9] mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/10 w-fit" style={{ background: "#1A1A1A" }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium transition-all"
                style={tab === t.key ? { background: ACCENT, color: "#fff" } : { color: "#B0ADA9" }}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {loading && <p className="text-[13px] text-[#B0ADA9]">Loading…</p>}

          {/* ====== SEO TAB ====== */}
          {tab === "seo" && !loading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-medium">Keyword Rankings</p>
                <button
                  onClick={() => setShowSeoForm(f => !f)}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: ACCENT, color: "#fff" }}
                >
                  <Plus size={13} />{showSeoForm ? "Cancel" : "Add Keyword"}
                </button>
              </div>

              {showSeoForm && (
                <div className="rounded-xl border border-white/10 p-4 mb-4 space-y-3" style={{ background: "#1A1A1A" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Keyword *"
                      value={newSeo.keyword}
                      onChange={e => setNewSeo(s => ({ ...s, keyword: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                    <input
                      placeholder="Ranking position (e.g. 4)"
                      type="number"
                      min={1}
                      value={newSeo.ranking}
                      onChange={e => setNewSeo(s => ({ ...s, ranking: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                  </div>
                  <input
                    placeholder="Ranking URL (optional)"
                    value={newSeo.url}
                    onChange={e => setNewSeo(s => ({ ...s, url: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                  />
                  <button onClick={addSeoMetric} className="text-[12px] px-4 py-2 rounded-lg" style={{ background: ACCENT, color: "#fff" }}>
                    Save Keyword
                  </button>
                </div>
              )}

              {seoMetrics.length === 0 ? (
                <p className="text-[13px] text-[#B0ADA9]">No keywords tracked yet.</p>
              ) : (
                <div className="rounded-xl border border-white/10 overflow-hidden" style={{ background: "#1A1A1A" }}>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] text-[#B0ADA9] uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">Keyword</th>
                        <th className="text-center px-4 py-3 font-medium">Rank</th>
                        <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">URL</th>
                        <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {seoMetrics.map((m, i) => (
                        <tr key={m.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                          <td className="px-4 py-3 font-medium">{m.keyword}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {rankIcon(m.ranking)}
                              <span className={m.ranking && m.ranking <= 3 ? "text-[#10B981]" : m.ranking && m.ranking <= 10 ? "text-[#F59E0B]" : "text-[#EF4444]"}>
                                {m.ranking ?? "—"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-[#B0ADA9] truncate max-w-[200px]">
                            {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.url}</a> : "—"}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-[#B0ADA9]">
                            {m.date ? new Date(m.date).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => deleteSeo(m.id)} className="text-[#B0ADA9] hover:text-[#EF4444] transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ====== CALENDAR TAB ====== */}
          {tab === "calendar" && !loading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-medium">Content Calendar</p>
                <button
                  onClick={() => setShowCalForm(f => !f)}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: ACCENT, color: "#fff" }}
                >
                  <Plus size={13} />{showCalForm ? "Cancel" : "Add Content"}
                </button>
              </div>

              {showCalForm && (
                <div className="rounded-xl border border-white/10 p-4 mb-4 space-y-3" style={{ background: "#1A1A1A" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Title *"
                      value={newCal.title}
                      onChange={e => setNewCal(s => ({ ...s, title: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                    <input
                      type="date"
                      value={newCal.scheduled_date}
                      onChange={e => setNewCal(s => ({ ...s, scheduled_date: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={newCal.content_type}
                      onChange={e => setNewCal(s => ({ ...s, content_type: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    >
                      {["blog", "post", "reel", "story", "email", "ad", "video"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      placeholder="Platform (optional)"
                      value={newCal.platform}
                      onChange={e => setNewCal(s => ({ ...s, platform: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                  </div>
                  <textarea
                    placeholder="Notes (optional)"
                    value={newCal.notes}
                    onChange={e => setNewCal(s => ({ ...s, notes: e.target.value }))}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20 resize-none"
                  />
                  <button onClick={addCalEvent} className="text-[12px] px-4 py-2 rounded-lg" style={{ background: ACCENT, color: "#fff" }}>
                    Save Event
                  </button>
                </div>
              )}

              {calEvents.length === 0 ? (
                <p className="text-[13px] text-[#B0ADA9]">No content scheduled yet.</p>
              ) : (
                <div className="space-y-2">
                  {calEvents.map(ev => (
                    <div key={ev.id} className="rounded-xl border border-white/10 p-4 flex items-start justify-between gap-4" style={{ background: "#1A1A1A" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[13px] font-medium truncate">{ev.title}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${CAL_STATUS_COLORS[ev.status] ?? "#737373"}20`, color: CAL_STATUS_COLORS[ev.status] ?? "#737373" }}>
                            {ev.status}
                          </span>
                          <span className="text-[11px] text-[#B0ADA9]">{ev.content_type}{ev.platform ? ` · ${ev.platform}` : ""}</span>
                        </div>
                        <p className="text-[11px] text-[#B0ADA9]">{ev.scheduled_date ? new Date(ev.scheduled_date).toLocaleDateString() : "—"}</p>
                        {ev.notes && <p className="text-[12px] text-[#B0ADA9] mt-1">{ev.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ev.status === "pending" && (
                          <button
                            onClick={() => updateCalStatus(ev.id, "published")}
                            className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-colors text-[#10B981]"
                          >
                            Publish
                          </button>
                        )}
                        <button onClick={() => deleteCal(ev.id)} className="text-[#B0ADA9] hover:text-[#EF4444] transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====== TASKS TAB ====== */}
          {tab === "tasks" && !loading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-medium">Marketing Tasks</p>
                <button
                  onClick={() => setShowTaskForm(f => !f)}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: ACCENT, color: "#fff" }}
                >
                  <Plus size={13} />{showTaskForm ? "Cancel" : "Add Task"}
                </button>
              </div>

              {showTaskForm && (
                <div className="rounded-xl border border-white/10 p-4 mb-4 space-y-3" style={{ background: "#1A1A1A" }}>
                  <textarea
                    placeholder="Task description *"
                    value={newTask.task_description}
                    onChange={e => setNewTask(s => ({ ...s, task_description: e.target.value }))}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20 resize-none"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <input
                      type="date"
                      value={newTask.due_date}
                      onChange={e => setNewTask(s => ({ ...s, due_date: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                    <select
                      value={newTask.priority}
                      onChange={e => setNewTask(s => ({ ...s, priority: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    >
                      {["low", "medium", "high"].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      placeholder="Category (optional)"
                      value={newTask.category}
                      onChange={e => setNewTask(s => ({ ...s, category: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-white/20"
                    />
                  </div>
                  <button onClick={addTask} className="text-[12px] px-4 py-2 rounded-lg" style={{ background: ACCENT, color: "#fff" }}>
                    Save Task
                  </button>
                </div>
              )}

              {tasks.length === 0 ? (
                <p className="text-[13px] text-[#B0ADA9]">No tasks yet.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map(t => (
                    <div key={t.id} className="rounded-xl border border-white/10 p-4 flex items-start justify-between gap-4" style={{ background: "#1A1A1A" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[13px] font-medium">{t.task_description}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${TASK_STATUS_COLORS[t.status] ?? "#737373"}20`, color: TASK_STATUS_COLORS[t.status] ?? "#737373" }}>
                            {t.status.replace("_", " ")}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: `${PRIORITY_COLORS[t.priority] ?? "#737373"}20`, color: PRIORITY_COLORS[t.priority] ?? "#737373" }}>
                            {t.priority}
                          </span>
                          {t.category && <span className="text-[11px] text-[#B0ADA9]">{t.category}</span>}
                        </div>
                        {t.due_date && <p className="text-[11px] text-[#B0ADA9]">Due {new Date(t.due_date).toLocaleDateString()}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.status === "in_progress" && (
                          <button
                            onClick={() => updateTaskStatus(t.id, "completed")}
                            className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 hover:border-white/20 transition-colors text-[#10B981]"
                          >
                            Complete
                          </button>
                        )}
                        <button onClick={() => deleteTask(t.id)} className="text-[#B0ADA9] hover:text-[#EF4444] transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

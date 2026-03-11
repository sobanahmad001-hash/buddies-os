"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TaskBoard from "@/components/dept/TaskBoard";
import ActivityFeed from "@/components/dept/ActivityFeed";

const CAMPAIGN_TYPES = ["organic", "paid", "email", "social", "event", "partnership"];

export default function MarketingDept() {
  const [dept, setDept] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [tab, setTab] = useState<"tasks"|"projects"|"calendar"|"activity">("tasks");
  const [newProject, setNewProject] = useState("");
  const [campaignType, setCampaignType] = useState("organic");
  const [perfNotes, setPerfNotes] = useState<Record<string, string>>({});

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: mem } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!mem) return;
    const { data: d } = await supabase.from("departments").select("*").eq("workspace_id", mem.workspace_id).eq("slug", "marketing").maybeSingle();
    if (!d) return;
    setDept(d);
    await loadAll(d.id, user.id);
  }

  async function loadAll(deptId: string, uid: string) {
    const [pRes, tRes, aRes, mRes] = await Promise.all([
      supabase.from("projects").select("*").eq("department_id", deptId),
      supabase.from("project_tasks").select("*").eq("department_id", deptId).neq("status", "cancelled").order("created_at", { ascending: false }),
      supabase.from("department_activity").select("*").eq("department_id", deptId).order("created_at", { ascending: false }).limit(30),
      supabase.from("memberships").select("*").eq("department_id", deptId),
    ]);
    setProjects(pRes.data ?? []);
    setTasks(tRes.data ?? []);
    setActivity(aRes.data ?? []);
    setMembers(mRes.data ?? []);
  }

  async function addProject() {
    if (!newProject.trim() || !dept || !userId) return;
    await supabase.from("projects").insert({
      user_id: userId, name: newProject.trim(),
      department_id: dept.id, status: "active",
      description: `[campaign:${campaignType}]`
    });
    setNewProject("");
    await loadAll(dept.id, userId);
  }

  async function savePerformanceNote(projectId: string, note: string) {
    const existing = projects.find(p => p.id === projectId);
    const campaignTag = existing?.description?.match(/\[campaign:[^\]]+\]/)?.[0] ?? "";
    await supabase.from("projects").update({ description: `${campaignTag}[perf]:${note}` }).eq("id", projectId);
    await loadAll(dept.id, userId);
  }

  // Content calendar tasks — tasks with dates
  const calendarTasks = tasks.filter(t => t.due_date);

  if (!dept) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-[#10B981] border-t-transparent animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[900px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#10B98120" }}>📣</div>
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Marketing</h1>
            <p className="text-xs text-[#737373]">Campaigns · Content · Growth · {members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {members.map((m: any) => (
              <div key={m.id} className="w-7 h-7 rounded-full bg-[#10B981] flex items-center justify-center text-white text-[10px] font-bold" title={m.invited_email}>
                {(m.invited_email ?? "?"[0])[0].toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* Marketing tools */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { name: "Notion", icon: "📓", url: "https://notion.so", desc: "Content docs" },
            { name: "Buffer", icon: "📱", url: "https://buffer.com", desc: "Social scheduling" },
            { name: "Mailchimp", icon: "✉️", url: "https://mailchimp.com", desc: "Email campaigns" },
            { name: "Analytics", icon: "📊", url: "https://analytics.google.com", desc: "Performance" },
          ].map(t => (
            <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
              className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#10B981] transition-colors">
              <span className="text-lg">{t.icon}</span>
              <div><div className="text-xs font-semibold text-[#1A1A1A]">{t.name}</div><div className="text-[10px] text-[#737373]">{t.desc}</div></div>
            </a>
          ))}
        </div>

        <div className="flex gap-1 mb-4 bg-[#F0EDE9] p-1 rounded-lg w-fit">
          {(["tasks","projects","calendar","activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-colors capitalize
                ${tab === t ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#737373] hover:text-[#1A1A1A]"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "tasks" && <TaskBoard tasks={tasks} departmentId={dept.id} userId={userId} onRefresh={() => loadAll(dept.id, userId)} />}

        {tab === "projects" && (
          <div>
            <div className="flex gap-2 mb-4">
              <input value={newProject} onChange={e => setNewProject(e.target.value)} onKeyDown={e => e.key === "Enter" && addProject()}
                placeholder="New campaign / project..."
                className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#10B981] bg-white" />
              <select value={campaignType} onChange={e => setCampaignType(e.target.value)}
                className="text-xs px-2 py-2 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                {CAMPAIGN_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={addProject} disabled={!newProject.trim()} className="px-4 py-2 bg-[#10B981] text-white text-sm font-semibold rounded-lg disabled:opacity-40">Add</button>
            </div>
            <div className="space-y-3">
              {projects.map((p: any) => {
                const campaignMatch = p.description?.match(/\[campaign:([^\]]+)\]/);
                const campaign = campaignMatch?.[1] ?? "";
                const perfMatch = p.description?.match(/\[perf\]:(.+)/);
                const perf = perfMatch?.[1] ?? "";
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm text-[#1A1A1A]">{p.name}</div>
                      <div className="flex items-center gap-2">
                        {campaign && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#10B98120] text-[#10B981] font-semibold capitalize">{campaign}</span>}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] font-semibold">{p.status}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-[#737373] shrink-0">Performance:</span>
                      <input value={perfNotes[p.id] ?? perf}
                        onChange={e => setPerfNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={e => e.target.value && savePerformanceNote(p.id, e.target.value)}
                        placeholder="Add performance notes... (e.g. CTR 4.2%, 1.2k leads)"
                        className="flex-1 text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#10B981]" />
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && <p className="text-sm text-[#737373] py-4 text-center">No campaigns yet.</p>}
            </div>
          </div>
        )}

        {tab === "calendar" && (
          <div>
            <p className="text-xs text-[#737373] mb-4">Tasks with due dates appear here as your content calendar.</p>
            {calendarTasks.length === 0 ? (
              <p className="text-sm text-[#737373] py-4 text-center">No scheduled content yet. Add tasks with due dates in the Tasks tab.</p>
            ) : (
              <div className="space-y-2">
                {calendarTasks.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((t: any) => (
                  <div key={t.id} className="bg-white rounded-xl border border-[#E5E2DE] p-3 flex items-center gap-3">
                    <div className="text-center min-w-[48px]">
                      <div className="text-[10px] text-[#737373]">{new Date(t.due_date).toLocaleString("default", { month: "short" })}</div>
                      <div className="text-lg font-bold text-[#1A1A1A] leading-none">{new Date(t.due_date).getDate()}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#1A1A1A]">{t.title}</div>
                      <div className="text-[10px] text-[#737373] capitalize">{t.status.replace("_", " ")}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold
                      ${t.status === "done" ? "bg-[#DCFCE7] text-[#166534]" : t.status === "in_progress" ? "bg-[#DBEAFE] text-[#1E40AF]" : "bg-[#F3F4F6] text-[#374151]"}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "activity" && <ActivityFeed activity={activity} />}
      </div>
    </div>
  );
}

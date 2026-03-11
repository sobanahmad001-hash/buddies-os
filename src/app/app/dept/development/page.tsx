"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TaskBoard from "@/components/dept/TaskBoard";
import ActivityFeed from "@/components/dept/ActivityFeed";

export default function DevDept() {
  const [dept, setDept] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [tab, setTab] = useState<"tasks"|"projects"|"bugs"|"activity">("tasks");
  const [newProject, setNewProject] = useState("");
  const [githubLinks, setGithubLinks] = useState<Record<string, string>>({});
  const [bugs, setBugs] = useState<any[]>([]);
  const [newBug, setNewBug] = useState("");

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: mem } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!mem) return;
    const { data: d } = await supabase.from("departments").select("*").eq("workspace_id", mem.workspace_id).eq("slug", "development").maybeSingle();
    if (!d) return;
    setDept(d);
    await loadAll(d.id, user.id);
  }

  async function loadAll(deptId: string, uid: string) {
    const [pRes, tRes, aRes, mRes, bRes] = await Promise.all([
      supabase.from("projects").select("*").eq("department_id", deptId),
      supabase.from("project_tasks").select("*").eq("department_id", deptId).neq("status", "cancelled").order("created_at", { ascending: false }),
      supabase.from("department_activity").select("*").eq("department_id", deptId).order("created_at", { ascending: false }).limit(30),
      supabase.from("memberships").select("*").eq("department_id", deptId),
      supabase.from("department_activity").select("*").eq("department_id", deptId).eq("activity_type", "bug").order("created_at", { ascending: false }),
    ]);
    setProjects(pRes.data ?? []);
    setTasks(tRes.data ?? []);
    setActivity(aRes.data ?? []);
    setMembers(mRes.data ?? []);
    setBugs(bRes.data ?? []);
  }

  async function addProject() {
    if (!newProject.trim() || !dept || !userId) return;
    await supabase.from("projects").insert({ user_id: userId, name: newProject.trim(), department_id: dept.id, status: "active" });
    setNewProject("");
    await loadAll(dept.id, userId);
  }

  async function addBug() {
    if (!newBug.trim() || !dept || !userId) return;
    await supabase.from("department_activity").insert({ department_id: dept.id, user_id: userId, activity_type: "bug", title: newBug.trim() });
    setNewBug("");
    await loadAll(dept.id, userId);
  }

  if (!dept) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[900px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#3B82F620" }}>💻</div>
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Development</h1>
            <p className="text-xs text-[#737373]">Engineering · Code · Infrastructure · {members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Dev tools */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { name: "GitHub", icon: "🐙", url: "https://github.com", desc: "Repositories" },
            { name: "Vercel", icon: "▲", url: "https://vercel.com", desc: "Deployments" },
            { name: "Supabase", icon: "⚡", url: "https://supabase.com", desc: "Database" },
            { name: "VS Code", icon: "🖊️", url: "https://vscode.dev", desc: "Editor" },
          ].map(t => (
            <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
              className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#3B82F6] transition-colors">
              <span className="text-lg">{t.icon}</span>
              <div><div className="text-xs font-semibold text-[#1A1A1A]">{t.name}</div><div className="text-[10px] text-[#737373]">{t.desc}</div></div>
            </a>
          ))}
        </div>

        <div className="flex gap-1 mb-4 bg-[#F0EDE9] p-1 rounded-lg w-fit">
          {(["tasks","projects","bugs","activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-colors capitalize
                ${tab === t ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#737373] hover:text-[#1A1A1A]"}`}>
              {t === "bugs" && bugs.length > 0
                ? <>{t} <span className="ml-1 bg-red-500 text-white text-[9px] px-1.5 rounded-full">{bugs.length}</span></>
                : t}
            </button>
          ))}
        </div>

        {tab === "tasks" && <TaskBoard tasks={tasks} departmentId={dept.id} userId={userId} onRefresh={() => loadAll(dept.id, userId)} />}

        {tab === "projects" && (
          <div>
            <div className="flex gap-2 mb-4">
              <input value={newProject} onChange={e => setNewProject(e.target.value)} onKeyDown={e => e.key === "Enter" && addProject()}
                placeholder="New dev project..." className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#3B82F6] bg-white" />
              <button onClick={addProject} disabled={!newProject.trim()} className="px-4 py-2 bg-[#3B82F6] text-white text-sm font-semibold rounded-lg disabled:opacity-40">Add</button>
            </div>
            <div className="space-y-3">
              {projects.map((p: any) => {
                const github = p.description?.startsWith("[github]:") ? p.description.replace("[github]:", "") : "";
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm text-[#1A1A1A]">{p.name}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#3B82F620] text-[#3B82F6] font-semibold">{p.status}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-[#737373] shrink-0">GitHub:</span>
                      <input value={githubLinks[p.id] ?? github}
                        onChange={e => setGithubLinks(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={async e => { if (e.target.value) { await supabase.from("projects").update({ description: `[github]:${e.target.value}` }).eq("id", p.id); await loadAll(dept.id, userId); } }}
                        placeholder="Paste GitHub repo URL..."
                        className="flex-1 text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#3B82F6]" />
                      {github && <a href={github} target="_blank" rel="noopener noreferrer" className="text-xs text-[#3B82F6] hover:underline shrink-0">Open ↗</a>}
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && <p className="text-sm text-[#737373] py-4 text-center">No dev projects yet.</p>}
            </div>
          </div>
        )}

        {tab === "bugs" && (
          <div>
            <div className="flex gap-2 mb-4">
              <input value={newBug} onChange={e => setNewBug(e.target.value)} onKeyDown={e => e.key === "Enter" && addBug()}
                placeholder="Report a bug..." className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-red-400 bg-white" />
              <button onClick={addBug} disabled={!newBug.trim()} className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40">Report</button>
            </div>
            <div className="space-y-2">
              {bugs.map((b: any) => (
                <div key={b.id} className="bg-white rounded-xl border border-red-100 p-3 flex items-center gap-3">
                  <span className="text-base">🐛</span>
                  <div className="flex-1 text-sm text-[#1A1A1A]">{b.title}</div>
                  <span className="text-[10px] text-[#737373]">{new Date(b.created_at).toLocaleDateString()}</span>
                </div>
              ))}
              {bugs.length === 0 && <p className="text-sm text-[#737373] py-4 text-center">No bugs reported. 🎉</p>}
            </div>
          </div>
        )}

        {tab === "activity" && <ActivityFeed activity={activity} />}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import TaskBoard from "@/components/dept/TaskBoard";
import ActivityFeed from "@/components/dept/ActivityFeed";

export default function DesignDept() {
  const [dept, setDept] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [tab, setTab] = useState<"projects"|"tasks"|"activity">("tasks");
  const [newProject, setNewProject] = useState("");
  const [figmaLinks, setFigmaLinks] = useState<Record<string, string>>({});

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: mem } = await supabase.from("memberships")
      .select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!mem) return;

    const { data: d } = await supabase.from("departments")
      .select("*").eq("workspace_id", mem.workspace_id).eq("slug", "design").maybeSingle();
    if (!d) return;
    setDept(d);

    await loadAll(d.id, user.id);
  }

  async function loadAll(deptId: string, uid: string) {
    const [pRes, tRes, aRes, mRes] = await Promise.all([
      supabase.from("projects").select("*").eq("department_id", deptId).eq("user_id", uid),
      supabase.from("project_tasks").select("*").eq("department_id", deptId).neq("status", "cancelled").order("created_at", { ascending: false }),
      supabase.from("department_activity").select("*").eq("department_id", deptId).order("created_at", { ascending: false }).limit(30),
      supabase.from("memberships").select("*, departments(name)").eq("department_id", deptId),
    ]);
    setProjects(pRes.data ?? []);
    setTasks(tRes.data ?? []);
    setActivity(aRes.data ?? []);
    setMembers(mRes.data ?? []);
  }

  async function addProject() {
    if (!newProject.trim() || !dept || !userId) return;
    await supabase.from("projects").insert({
      user_id: userId, name: newProject.trim(), department_id: dept.id, status: "active"
    });
    setNewProject("");
    await loadAll(dept.id, userId);
  }

  async function saveFigmaLink(projectId: string, link: string) {
    await supabase.from("projects").update({ description: `[figma]:${link}` }).eq("id", projectId);
    await loadAll(dept.id, userId);
  }

  if (!dept) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-[#8B5CF6] border-t-transparent animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[900px]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#8B5CF620" }}>🎨</div>
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Design</h1>
            <p className="text-xs text-[#737373]">UI/UX · Brand · Visual Feedback · {members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {members.map((m: any) => (
              <div key={m.id} className="w-7 h-7 rounded-full bg-[#8B5CF6] flex items-center justify-center text-white text-[10px] font-bold" title={m.invited_email}>
                {(m.invited_email ?? "?"[0])[0].toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* Tools strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <a href="https://figma.com" target="_blank" rel="noopener noreferrer"
            className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#8B5CF6] transition-colors">
            <span className="text-lg">🖼️</span>
            <div><div className="text-xs font-semibold text-[#1A1A1A]">Figma</div><div className="text-[10px] text-[#737373]">Design files</div></div>
          </a>
          <a href="https://www.canva.com" target="_blank" rel="noopener noreferrer"
            className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#8B5CF6] transition-colors">
            <span className="text-lg">🎨</span>
            <div><div className="text-xs font-semibold text-[#1A1A1A]">Canva</div><div className="text-[10px] text-[#737373]">Brand assets</div></div>
          </a>
          <a href="https://coolors.co" target="_blank" rel="noopener noreferrer"
            className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#8B5CF6] transition-colors">
            <span className="text-lg">🎭</span>
            <div><div className="text-xs font-semibold text-[#1A1A1A]">Coolors</div><div className="text-[10px] text-[#737373]">Color palettes</div></div>
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-[#F0EDE9] p-1 rounded-lg w-fit">
          {(["tasks","projects","activity"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-colors capitalize
                ${tab === t ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#737373] hover:text-[#1A1A1A]"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "tasks" && (
          <TaskBoard tasks={tasks} departmentId={dept.id} userId={userId} onRefresh={() => loadAll(dept.id, userId)} />
        )}

        {tab === "projects" && (
          <div>
            <div className="flex gap-2 mb-4">
              <input value={newProject} onChange={e => setNewProject(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addProject()}
                placeholder="New design project..."
                className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#8B5CF6] bg-white" />
              <button onClick={addProject} disabled={!newProject.trim()}
                className="px-4 py-2 bg-[#8B5CF6] text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-[#7C3AED]">Add</button>
            </div>
            <div className="space-y-3">
              {projects.map((p: any) => {
                const figma = p.description?.startsWith("[figma]:") ? p.description.replace("[figma]:", "") : "";
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm text-[#1A1A1A]">{p.name}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#8B5CF620] text-[#8B5CF6] font-semibold">{p.status}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-[#737373] shrink-0">Figma:</span>
                      <input value={figmaLinks[p.id] ?? figma} onChange={e => setFigmaLinks(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={e => e.target.value && saveFigmaLink(p.id, e.target.value)}
                        placeholder="Paste Figma URL..."
                        className="flex-1 text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#8B5CF6]" />
                      {figma && <a href={figma} target="_blank" rel="noopener noreferrer" className="text-xs text-[#8B5CF6] hover:underline shrink-0">Open ↗</a>}
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && <p className="text-sm text-[#737373] py-4 text-center">No design projects yet.</p>}
            </div>
          </div>
        )}

        {tab === "activity" && <ActivityFeed activity={activity} />}
      </div>
    </div>
  );
}

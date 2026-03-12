"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useRole } from "@/hooks/useRole";
import TaskBoard from "@/components/dept/TaskBoard";
import ActivityFeed from "@/components/dept/ActivityFeed";
import MiniDashboard from "@/components/dept/MiniDashboard";

const ACCENT = "#8B5CF6";

export default function DesignDept() {
  const { activeWorkspace } = useWorkspace();
  const { canSeeAllDeptTasks, canSeeAllDeptProjects, canSeeActivityFeed, canAssignTasks, isIntern } = useRole();
  const [dept, setDept] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [tab, setTab] = useState<"tasks"|"projects"|"activity">("tasks");
  const [newProject, setNewProject] = useState("");
  const [figmaLinks, setFigmaLinks] = useState<Record<string, string>>({});

  useEffect(() => { init(); }, [activeWorkspace]);

  async function init() {
    if (!activeWorkspace) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: mem } = await supabase.from("memberships")
      .select("role").eq("user_id", user.id).eq("workspace_id", activeWorkspace.id).eq("status", "active").maybeSingle();
    const role = mem?.role ?? "";
    setUserRole(role);
    const { data: d } = await supabase.from("departments")
      .select("*").eq("workspace_id", activeWorkspace.id).eq("slug", "design").maybeSingle();
    if (!d) return;
    setDept(d);
    await loadAll(d.id, user.id, role);
  }

  async function loadAll(deptId: string, uid: string, role: string) {
    const isHead = role === "owner" || role === "dept_head";
    const [pRes, tRes, aRes, mRes] = await Promise.all([
      isHead
        ? supabase.from("projects").select("*").eq("department_id", deptId)
        : supabase.from("projects").select("*").eq("department_id", deptId).eq("user_id", uid),
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
    await supabase.from("projects").insert({ user_id: userId, name: newProject.trim(), department_id: dept.id, status: "active" });
    setNewProject("");
    await loadAll(dept.id, userId, userRole);
  }

  const isHead = userRole === "owner" || userRole === "dept_head";
  const tabs = isIntern ? ["tasks"] : ["tasks", "projects", "activity"];

  if (!dept) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} /></div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[900px]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${ACCENT}20` }}>🎨</div>
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Design</h1>
            <p className="text-xs text-[#737373]">UI/UX · Brand · Visual · {members.length} member{members.length !== 1 ? "s" : ""}
              {userRole && <span className="ml-2 px-2 py-0.5 rounded-full text-white text-[9px] font-bold" style={{ backgroundColor: ACCENT }}>
                {userRole === "dept_head" ? "DEPT HEAD" : userRole === "executive" ? "EXECUTIVE" : "INTERN"}
              </span>}
            </p>
          </div>
          {isHead && (
            <div className="ml-auto flex items-center gap-1">
              {members.map((m: any) => (
                <div key={m.id} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: ACCENT }}
                  title={`${m.invited_email} · ${m.role}`}>
                  {(m.invited_email ?? "?")[0].toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tools */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { name: "Figma", icon: "🖼️", url: "https://figma.com", desc: "Design files" },
            { name: "Canva", icon: "🎨", url: "https://canva.com", desc: "Brand assets" },
            { name: "Coolors", icon: "🎭", url: "https://coolors.co", desc: "Color palettes" },
          ].map(t => (
            <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
              className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#8B5CF6] transition-colors">
              <span className="text-lg">{t.icon}</span>
              <div><div className="text-xs font-semibold">{t.name}</div><div className="text-[10px] text-[#737373]">{t.desc}</div></div>
            </a>
          ))}
        </div>

        {/* Mini Dashboard */}
        <MiniDashboard
          totalTasks={tasks.length}
          inProgress={tasks.filter(t => t.status === "in_progress").length}
          done={tasks.filter(t => t.status === "done").length}
          todo={tasks.filter(t => t.status === "todo").length}
          memberCount={members.length}
          lastActivity={activity[0]?.title ?? null}
          accentColor={ACCENT}
        />

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-[#F0EDE9] p-1 rounded-lg w-fit">
          {(tabs as string[]).map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-md transition-colors capitalize
                ${tab === t ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#737373] hover:text-[#1A1A1A]"}`}>{t}</button>
          ))}
        </div>

        {tab === "tasks" && (
          <TaskBoard tasks={tasks} departmentId={dept.id} userId={userId}
            members={members} canSeeAll={isHead} canAssign={isHead}
            accentColor={ACCENT} onRefresh={() => loadAll(dept.id, userId, userRole)} />
        )}

        {tab === "projects" && (
          <div>
            {isHead && (
              <div className="flex gap-2 mb-4">
                <input value={newProject} onChange={e => setNewProject(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addProject()}
                  placeholder="New design project..."
                  className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none bg-white" />
                <button onClick={addProject} disabled={!newProject.trim()}
                  className="px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-40" style={{ backgroundColor: ACCENT }}>Add</button>
              </div>
            )}
            <div className="space-y-3">
              {projects.map((p: any) => {
                const figma = p.description?.startsWith("[figma]:") ? p.description.replace("[figma]:", "") : "";
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">{p.name}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: ACCENT }}>{p.status}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-[#737373] shrink-0">Figma:</span>
                      <input value={figmaLinks[p.id] ?? figma}
                        onChange={e => setFigmaLinks(prev => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={async e => { if (e.target.value) { await supabase.from("projects").update({ description: `[figma]:${e.target.value}` }).eq("id", p.id); } }}
                        placeholder="Paste Figma URL..."
                        className="flex-1 text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg focus:outline-none" />
                      {figma && <a href={figma} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline shrink-0" style={{ color: ACCENT }}>Open ↗</a>}
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

"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "@/hooks/useRole";
import TaskBoard from "@/components/dept/TaskBoard";
import ActivityFeed from "@/components/dept/ActivityFeed";

const ACCENT = "#10B981";

export default function MarketingDept() {
  const { isIntern } = useRole();
  const [dept, setDept] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [tab, setTab] = useState<"tasks"|"campaigns"|"content"|"activity">("tasks");
  const [newCampaign, setNewCampaign] = useState("");
  const [newContent, setNewContent] = useState({ title: "", type: "post", due: "" });

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: mem } = await supabase.from("memberships")
      .select("workspace_id, role").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!mem) return;
    setUserRole(mem.role);
    const { data: d } = await supabase.from("departments")
      .select("*").eq("workspace_id", mem.workspace_id).eq("slug", "marketing").maybeSingle();
    if (!d) return;
    setDept(d);
    await loadAll(d.id, user.id, mem.role);
  }

  async function loadAll(deptId: string, uid: string, role: string) {
    const isHead = role === "owner" || role === "dept_head";
    const [pRes, tRes, aRes, mRes, cRes] = await Promise.all([
      isHead
        ? supabase.from("projects").select("*").eq("department_id", deptId)
        : supabase.from("projects").select("*").eq("department_id", deptId).eq("user_id", uid),
      supabase.from("project_tasks").select("*").eq("department_id", deptId).neq("status", "cancelled").order("created_at", { ascending: false }),
      supabase.from("department_activity").select("*").eq("department_id", deptId).order("created_at", { ascending: false }).limit(30),
      supabase.from("memberships").select("*").eq("department_id", deptId),
      supabase.from("department_activity").select("*").eq("department_id", deptId).eq("activity_type", "campaign").order("created_at", { ascending: false }),
    ]);
    setProjects(pRes.data ?? []);
    setTasks(tRes.data ?? []);
    setActivity(aRes.data ?? []);
    setMembers(mRes.data ?? []);
    setContentItems(cRes.data ?? []);
  }

  async function addCampaign() {
    if (!newCampaign.trim() || !dept || !userId) return;
    await supabase.from("projects").insert({ user_id: userId, name: newCampaign.trim(), department_id: dept.id, status: "active" });
    setNewCampaign("");
    await loadAll(dept.id, userId, userRole);
  }

  async function addContent() {
    if (!newContent.title.trim() || !dept || !userId) return;
    await supabase.from("department_activity").insert({
      department_id: dept.id, user_id: userId, activity_type: "campaign",
      title: newContent.title.trim(), metadata: { type: newContent.type, due: newContent.due }
    });
    setNewContent({ title: "", type: "post", due: "" });
    await loadAll(dept.id, userId, userRole);
  }

  const isHead = userRole === "owner" || userRole === "dept_head";
  const tabs = isIntern ? ["tasks", "content"] : ["tasks", "campaigns", "content", "activity"];

  if (!dept) return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} /></div>;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[900px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${ACCENT}20` }}>📣</div>
          <div>
            <h1 className="text-[20px] font-semibold">Marketing</h1>
            <p className="text-xs text-[#737373]">Campaigns · Content · Growth · {members.length} member{members.length !== 1 ? "s" : ""}
              {userRole && userRole !== "owner" && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-white text-[9px] font-bold" style={{ backgroundColor: ACCENT }}>
                  {userRole === "dept_head" ? "DEPT HEAD" : userRole === "executive" ? "EXECUTIVE" : "INTERN"}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { name: "Google Ads", icon: "📊", url: "https://ads.google.com", desc: "Ad campaigns" },
            { name: "Meta Ads", icon: "📘", url: "https://business.facebook.com", desc: "Social ads" },
            { name: "Mailchimp", icon: "📧", url: "https://mailchimp.com", desc: "Email marketing" },
            { name: "Analytics", icon: "📈", url: "https://analytics.google.com", desc: "Traffic data" },
          ].map(t => (
            <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
              className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#10B981] transition-colors">
              <span className="text-lg">{t.icon}</span>
              <div><div className="text-xs font-semibold">{t.name}</div><div className="text-[10px] text-[#737373]">{t.desc}</div></div>
            </a>
          ))}
        </div>

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

        {tab === "campaigns" && (
          <div>
            {isHead && (
              <div className="flex gap-2 mb-4">
                <input value={newCampaign} onChange={e => setNewCampaign(e.target.value)} onKeyDown={e => e.key === "Enter" && addCampaign()}
                  placeholder="New campaign..." className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none bg-white" />
                <button onClick={addCampaign} disabled={!newCampaign.trim()} className="px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-40" style={{ backgroundColor: ACCENT }}>Add</button>
              </div>
            )}
            <div className="space-y-3">
              {projects.map((p: any) => (
                <div key={p.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4 flex items-center justify-between">
                  <div className="font-medium text-sm">{p.name}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold" style={{ backgroundColor: ACCENT }}>{p.status}</span>
                </div>
              ))}
              {projects.length === 0 && <p className="text-sm text-[#737373] py-4 text-center">No campaigns yet.</p>}
            </div>
          </div>
        )}

        {tab === "content" && (
          <div>
            <div className="bg-white rounded-xl border border-[#E5E2DE] p-4 mb-4">
              <div className="grid grid-cols-3 gap-2">
                <input value={newContent.title} onChange={e => setNewContent(p => ({ ...p, title: e.target.value }))}
                  placeholder="Content title..." className="col-span-3 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none" />
                <select value={newContent.type} onChange={e => setNewContent(p => ({ ...p, type: e.target.value }))}
                  className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                  {["post","email","ad","video","blog","story"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={newContent.due} onChange={e => setNewContent(p => ({ ...p, due: e.target.value }))}
                  className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none" />
                <button onClick={addContent} disabled={!newContent.title.trim()}
                  className="px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-40" style={{ backgroundColor: ACCENT }}>Add</button>
              </div>
            </div>
            <div className="space-y-2">
              {contentItems.map((c: any) => (
                <div key={c.id} className="bg-white rounded-xl border border-[#E5E2DE] p-3 flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded-full text-white font-semibold capitalize" style={{ backgroundColor: ACCENT }}>{c.metadata?.type ?? "post"}</span>
                  <div className="flex-1 text-sm">{c.title}</div>
                  {c.metadata?.due && <span className="text-xs text-[#737373]">Due {new Date(c.metadata.due).toLocaleDateString()}</span>}
                </div>
              ))}
              {contentItems.length === 0 && <p className="text-sm text-[#737373] py-4 text-center">No content planned yet.</p>}
            </div>
          </div>
        )}

        {tab === "activity" && <ActivityFeed activity={activity} />}
      </div>
    </div>
  );
}

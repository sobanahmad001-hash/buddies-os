"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useWorkspace } from "@/context/WorkspaceContext";
import { Users, ChevronRight, Plus, Copy, Palette, Code2, Megaphone } from "lucide-react";

const DEPT_META: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  design:      { icon: Palette,   color: "#8B5CF6", bg: "#8B5CF610", label: "Design" },
  development: { icon: Code2,     color: "#3B82F6", bg: "#3B82F610", label: "Development" },
  marketing:   { icon: Megaphone, color: "#10B981", bg: "#10B98110", label: "Marketing" },
};

const ROLES = ["dept_head", "executive", "intern"];
const ROLE_LABEL: Record<string, string> = { dept_head: "Dept Head", executive: "Executive", intern: "Intern" };

export default function WorkspacePage() {
  const router = useRouter();
  const { activeWorkspace, setActiveWorkspace, loading } = useWorkspace();
  const [departments, setDepartments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [deptStats, setDeptStats] = useState<Record<string, any>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("executive");
  const [inviteDept, setInviteDept] = useState("");
  const [inviting, setInviting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { if (activeWorkspace) setNewName(activeWorkspace.name); }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace) return;
    Promise.all([loadDepts(activeWorkspace.id), loadMembers(activeWorkspace.id), loadInvites(activeWorkspace.id)]);
  }, [activeWorkspace]);

  async function loadDepts(wsId: string) {
    const { data } = await supabase.from("departments").select("*").eq("workspace_id", wsId).order("name");
    setDepartments(data ?? []);
    // Load stats per dept
    const stats: Record<string, any> = {};
    for (const d of (data ?? [])) {
      const [tRes, aRes, mRes] = await Promise.all([
        supabase.from("project_tasks").select("status").eq("department_id", d.id).neq("status", "cancelled"),
        supabase.from("department_activity").select("created_at, title").eq("department_id", d.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("memberships").select("id").eq("department_id", d.id).eq("status", "active"),
      ]);
      const tasks = tRes.data ?? [];
      stats[d.id] = {
        total: tasks.length,
        inProgress: tasks.filter((t: any) => t.status === "in_progress").length,
        done: tasks.filter((t: any) => t.status === "done").length,
        todo: tasks.filter((t: any) => t.status === "todo").length,
        lastActivity: aRes.data?.[0]?.title ?? null,
        lastAt: aRes.data?.[0]?.created_at ?? null,
        memberCount: mRes.data?.length ?? 0,
      };
    }
    setDeptStats(stats);
  }

  async function loadMembers(wsId: string) {
    const { data } = await supabase.from("memberships")
      .select("*, departments(name, slug, color)")
      .eq("workspace_id", wsId).neq("status", "suspended");
    const enriched = (data ?? []).map((m: any) => ({
      ...m,
      invited_email: m.invited_email ?? (m.role === "owner" ? "sobanahmed9090@gmail.com" : m.user_id)
    }));
    setMembers(enriched);
  }

  async function loadInvites(wsId: string) {
    const { data } = await supabase.from("workspace_invites")
      .select("*").eq("workspace_id", wsId).eq("status", "pending");
    setInvites(data ?? []);
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || !activeWorkspace) return;
    setInviting(true);
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("workspace_invites").insert({
      workspace_id: activeWorkspace.id, invited_by: (await supabase.auth.getUser()).data.user?.id,
      email: inviteEmail.trim(), role: inviteRole, token, status: "pending", expires_at: expires
    });
    setInviteEmail("");
    setInviting(false);
    await loadInvites(activeWorkspace.id);
  }

  async function assignDepartment(memberId: string, deptId: string) {
    await supabase.from("memberships").update({ department_id: deptId || null }).eq("id", memberId);
    if (activeWorkspace) await loadMembers(activeWorkspace.id);
  }

  async function updateRole(memberId: string, role: string) {
    await supabase.from("memberships").update({ role }).eq("id", memberId);
    if (activeWorkspace) await loadMembers(activeWorkspace.id);
  }

  async function saveName() {
    if (!newName.trim() || !activeWorkspace) return;
    await supabase.from("workspaces").update({ name: newName.trim() }).eq("id", activeWorkspace.id);
    setActiveWorkspace({ ...activeWorkspace, name: newName.trim() });
    setEditingName(false);
  }

  function copyInviteLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/join?token=${token}`);
  }

  const membersByDept = (deptId: string) => members.filter(m => m.department_id === deptId && m.role !== "owner");
  const unassigned = members.filter(m => !m.department_id && m.role !== "owner");

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#E8521A] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-[#0F0F0F] text-white px-8 py-6">
        <div className="max-w-[1000px]">
          <div className="flex items-center gap-3 mb-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  className="text-[24px] font-bold bg-transparent border-b border-white/40 focus:outline-none focus:border-white" autoFocus />
                <button onClick={saveName} className="text-xs px-3 py-1 bg-[#E8521A] rounded-lg">Save</button>
                <button onClick={() => setEditingName(false)} className="text-xs px-3 py-1 bg-white/10 rounded-lg">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-[24px] font-bold tracking-tight">{activeWorkspace?.name ?? "ANKA"}</h1>
                <button onClick={() => setEditingName(true)} className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/60 hover:bg-white/20 transition-colors">Edit</button>
              </div>
            )}
          </div>
          <p className="text-white/40 text-xs">{members.filter(m => m.role !== "owner").length} team members · {departments.length} departments</p>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1000px]">

        {/* Department Cards */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-[#737373] uppercase tracking-widest mb-4">Departments</h2>
          <div className="grid grid-cols-3 gap-4">
            {departments.map(dept => {
              const meta = DEPT_META[dept.slug] ?? { color: "#E8521A", bg: "#E8521A10", label: dept.name, icon: Users };
              const Icon = meta.icon;
              const stats = deptStats[dept.id] ?? {};
              const dMembers = membersByDept(dept.id);
              return (
                <div key={dept.id}
                  onClick={() => router.push(`/app/dept/${dept.slug}`)}
                  className="bg-white rounded-2xl border border-[#E5E2DE] p-5 cursor-pointer hover:shadow-md transition-all hover:border-[#D5D0CA] group">
                  {/* Dept header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: meta.bg }}>
                        <Icon size={16} style={{ color: meta.color }} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#1A1A1A]">{meta.label}</div>
                        <div className="text-[10px] text-[#737373]">{dMembers.length} member{dMembers.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#B0ADA9] group-hover:text-[#737373] transition-colors" />
                  </div>

                  {/* Task stats */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { label: "Todo", value: stats.todo ?? 0, color: "#737373" },
                      { label: "Active", value: stats.inProgress ?? 0, color: meta.color },
                      { label: "Done", value: stats.done ?? 0, color: "#10B981" },
                    ].map(s => (
                      <div key={s.label} className="text-center p-2 rounded-lg bg-[#F7F5F2]">
                        <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                        <div className="text-[9px] text-[#B0ADA9] font-medium uppercase tracking-wide">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Last activity */}
                  {stats.lastActivity && (
                    <div className="text-[10px] text-[#B0ADA9] truncate border-t border-[#F0EDE9] pt-3">
                      ↑ {stats.lastActivity}
                    </div>
                  )}

                  {/* Member avatars */}
                  {dMembers.length > 0 && (
                    <div className="flex items-center gap-1 mt-3">
                      {dMembers.slice(0, 5).map((m: any) => (
                        <div key={m.id} className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: meta.color }} title={m.invited_email}>
                          {(m.invited_email ?? "?")[0].toUpperCase()}
                        </div>
                      ))}
                      {dMembers.length > 5 && <div className="text-[10px] text-[#737373]">+{dMembers.length - 5}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite */}
        <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-6">
          <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Invite Team Member</h2>
          <div className="flex gap-2">
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendInvite()}
              placeholder="Email address"
              className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] bg-white" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <select value={inviteDept} onChange={e => setInviteDept(e.target.value)}
              className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
              <option value="">No dept yet</option>
              {departments.map(d => <option key={d.id} value={d.id}>{DEPT_META[d.slug]?.label ?? d.name}</option>)}
            </select>
            <button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}
              className="px-5 py-2 bg-[#E8521A] text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-[#c94415]">
              Invite
            </button>
          </div>
        </div>

        {/* Members by department */}
        <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-6">
          <h2 className="text-sm font-bold text-[#1A1A1A] mb-5">Team</h2>
          {departments.map(dept => {
            const meta = DEPT_META[dept.slug] ?? { color: "#E8521A", bg: "#E8521A10", label: dept.name, icon: Users };
            const Icon = meta.icon;
            const dMembers = membersByDept(dept.id);
            if (dMembers.length === 0) return null;
            return (
              <div key={dept.id} className="mb-5 last:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={12} style={{ color: meta.color }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <div className="space-y-2 pl-4">
                  {dMembers.map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: meta.color }}>
                        {(m.invited_email ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 text-sm text-[#1A1A1A] truncate">{m.invited_email}</div>
                      <select value={m.role} onChange={e => updateRole(m.id, e.target.value)}
                        className="text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <select value={m.department_id ?? ""} onChange={e => assignDepartment(m.id, e.target.value)}
                        className="text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                        <option value="">No dept</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{DEPT_META[d.slug]?.label ?? d.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={12} className="text-[#B0ADA9]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#B0ADA9]">Unassigned</span>
              </div>
              <div className="space-y-2 pl-4">
                {unassigned.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#E5E2DE] flex items-center justify-center text-[#737373] text-[10px] font-bold shrink-0">
                      {(m.invited_email ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 text-sm text-[#1A1A1A] truncate">{m.invited_email}</div>
                    <select value={m.role} onChange={e => updateRole(m.id, e.target.value)}
                      className="text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <select value={m.department_id ?? ""} onChange={e => assignDepartment(m.id, e.target.value)}
                      className="text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                      <option value="">Assign dept</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{DEPT_META[d.slug]?.label ?? d.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5">
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Pending Invites</h2>
            <div className="space-y-2">
              {invites.map((inv: any) => (
                <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-[#F7F5F2] last:border-0">
                  <div className="flex-1">
                    <div className="text-sm text-[#1A1A1A]">{inv.email}</div>
                    <div className="text-[10px] text-[#B0ADA9]">expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F0EDE9] text-[#737373] font-semibold">{ROLE_LABEL[inv.role] ?? inv.role}</span>
                  <button onClick={() => copyInviteLink(inv.token)}
                    className="flex items-center gap-1 text-xs text-[#E8521A] hover:underline">
                    <Copy size={11} /> Copy link
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

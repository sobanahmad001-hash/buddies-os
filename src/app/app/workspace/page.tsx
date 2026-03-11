"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ROLES = ["agent","developer","admin","viewer"];
const ROLE_COLORS: Record<string,string> = {
  owner: "bg-[#E8521A] text-white",
  admin: "bg-[#DBEAFE] text-[#1E40AF]",
  developer: "bg-[#DCFCE7] text-[#166534]",
  agent: "bg-[#F3F4F6] text-[#374151]",
  viewer: "bg-[#F7F5F2] text-[#6B7280]",
};

export default function WorkspacePage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [wsName, setWsName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);
    await loadWorkspace(user.id);
    setLoading(false);
  }

  async function loadWorkspace(uid: string) {
    // Direct client-side read — bypasses SSR cookie issues
    const { data: ws } = await supabase
      .from("workspaces").select("*").eq("owner_id", uid).maybeSingle();

    if (ws) {
      setWorkspace(ws);
      await loadMembers(ws.id);
      await loadInvites(ws.id);
    } else {
      // Check if member of someone else's workspace
      const { data: mem } = await supabase
        .from("memberships").select("workspace_id, role")
        .eq("user_id", uid).eq("status", "active").maybeSingle();
      if (mem) {
        const { data: ws2 } = await supabase
          .from("workspaces").select("*").eq("id", mem.workspace_id).maybeSingle();
        if (ws2) setWorkspace(ws2);
      }
    }
  }

  async function loadMembers(wsId: string) {
    const { data } = await supabase
      .from("memberships").select("*").eq("workspace_id", wsId);
    setMembers(data ?? []);
  }

  async function loadInvites(wsId: string) {
    const { data } = await supabase
      .from("workspace_invites").select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false });
    setInvites(data ?? []);
  }

  async function createWorkspace() {
    if (!wsName.trim() || !userId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("workspaces")
      .insert({ name: wsName.trim(), owner_id: userId })
      .select().single();

    if (error) {
      alert("Error: " + error.message);
      setCreating(false);
      return;
    }

    // Add self as owner member
    await supabase.from("memberships").insert({
      workspace_id: data.id, user_id: userId, role: "owner", status: "active"
    });

    setWorkspace(data);
    await loadMembers(data.id);
    setCreating(false);
  }

  async function saveWorkspaceName() {
    if (!editName.trim() || !workspace || !userId) return;
    const { error } = await supabase
      .from("workspaces")
      .update({ name: editName.trim() })
      .eq("id", workspace.id)
      .eq("owner_id", userId);
    if (error) { alert(error.message); return; }
    setWorkspace({ ...workspace, name: editName.trim() });
    setEditing(false);
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || !workspace) return;
    setInviting(true);
    const res = await fetch("/api/workspace/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, workspace_id: workspace.id })
    });
    const d = await res.json();
    if (d.inviteUrl) {
      setGeneratedLink(d.inviteUrl);
      setInviteEmail("");
      await loadInvites(workspace.id);
    } else {
      alert(d.error ?? "Failed to create invite");
    }
    setInviting(false);
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function updateMember(memberId: string, updates: any) {
    await supabase.from("memberships").update(updates).eq("id", memberId);
    if (workspace) await loadMembers(workspace.id);
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#E8521A] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="max-w-[720px]">
        <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-1">Workspace</h1>
        <p className="text-sm text-[#737373] mb-8">Invite your team, manage roles, share projects.</p>

        {!workspace ? (
          <div className="bg-white rounded-xl border border-[#E5E2DE] p-6">
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Create Your Workspace</h2>
            <div className="flex gap-2">
              <input value={wsName} onChange={e => setWsName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createWorkspace()}
                placeholder="e.g. Anka Sphere"
                className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]" />
              <button onClick={createWorkspace} disabled={creating || !wsName.trim()}
                className="px-4 py-2 bg-[#E8521A] text-white text-sm font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40">
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-xl border border-[#E5E2DE] p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveWorkspaceName(); if (e.key === "Escape") setEditing(false); }}
                        autoFocus
                        className="text-[16px] font-semibold text-[#1A1A1A] border-b-2 border-[#E8521A] bg-transparent focus:outline-none flex-1" />
                      <button onClick={saveWorkspaceName} className="text-xs font-semibold text-[#E8521A] hover:underline">Save</button>
                      <button onClick={() => setEditing(false)} className="text-xs text-[#737373] hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-[16px] font-semibold text-[#1A1A1A]">{workspace.name}</div>
                      <button onClick={() => { setEditName(workspace.name); setEditing(true); }}
                        className="text-[10px] text-[#737373] hover:text-[#E8521A] px-1.5 py-0.5 rounded border border-[#E5E2DE] hover:border-[#E8521A] transition-colors">
                        Edit
                      </button>
                    </div>
                  )}
                  <div className="text-xs text-[#737373] mt-0.5">
                    {members.length} member{members.length !== 1 ? "s" : ""} · {invites.filter((i:any) => i.status === "pending").length} pending
                  </div>
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#E8521A] text-white font-semibold">Owner</span>
              </div>
            </div>

            {/* Invite */}
            <div className="bg-white rounded-xl border border-[#E5E2DE] p-5">
              <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Invite Team Member</h2>
              <div className="flex gap-2 mb-3">
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendInvite()}
                  placeholder="Email address"
                  className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]" />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none bg-white">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}
                  className="px-4 py-2 bg-[#1A1A1A] text-white text-sm font-semibold rounded-lg hover:bg-[#333] disabled:opacity-40">
                  {inviting ? "..." : "Invite"}
                </button>
              </div>

              {generatedLink && (
                <div className="bg-[#F7F5F2] rounded-lg p-3 flex items-center gap-2">
                  <span className="text-xs text-[#737373] flex-1 truncate">{generatedLink}</span>
                  <button onClick={() => copyLink(generatedLink)}
                    className="text-xs font-semibold text-[#E8521A] hover:underline shrink-0">
                    {copied ? "✓ Copied!" : "Copy link"}
                  </button>
                </div>
              )}
            </div>

            {/* Members */}
            <div className="bg-white rounded-xl border border-[#E5E2DE] p-5">
              <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Members ({members.length})</h2>
              {members.length === 0 ? (
                <p className="text-sm text-[#737373]">No members yet.</p>
              ) : (
                <div className="space-y-1">
                  {members.map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-[#F7F5F2] last:border-0">
                      <div className="w-8 h-8 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(m.invited_email ?? m.user_id ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#1A1A1A] truncate">{m.invited_email ?? m.user_id}</div>
                        <div className="text-xs text-[#737373]">{new Date(m.joined_at).toLocaleDateString()}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_COLORS[m.role] ?? ROLE_COLORS.agent}`}>
                        {m.role}
                      </span>
                      {m.role !== "owner" && (
                        <>
                          <select value={m.role}
                            onChange={e => updateMember(m.id, { role: e.target.value })}
                            className="text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button onClick={() => updateMember(m.id, { status: "suspended" })}
                            className="text-xs text-[#EF4444] hover:underline">Remove</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending invites */}
            {invites.filter((i:any) => i.status === "pending").length > 0 && (
              <div className="bg-white rounded-xl border border-[#E5E2DE] p-5">
                <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Pending Invites</h2>
                <div className="space-y-1">
                  {invites.filter((i:any) => i.status === "pending").map((inv: any) => (
                    <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-[#F7F5F2] last:border-0">
                      <div className="flex-1">
                        <div className="text-sm text-[#1A1A1A]">{inv.email}</div>
                        <div className="text-xs text-[#737373]">expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_COLORS[inv.role] ?? ROLE_COLORS.agent}`}>
                        {inv.role}
                      </span>
                      <button onClick={() => copyLink(`${window.location.origin}/join?token=${inv.token}`)}
                        className="text-xs text-[#E8521A] hover:underline">Copy link</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

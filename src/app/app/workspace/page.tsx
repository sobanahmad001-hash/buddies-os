"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ROLES = ["agent","developer","admin","viewer"];
const ROLE_COLORS: Record<string,string> = {
  owner: "bg-[#E8521A] text-white",
  admin: "bg-[#DBEAFE] text-[#2C5F8A]",
  developer: "bg-[#DCFCE7] text-[#2D6A4F]",
  agent: "bg-[#F3F4F6] text-[#404040]",
  viewer: "bg-[#F7F5F2] text-[#737373]",
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

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const [wsRes, membersRes, invitesRes] = await Promise.all([
      fetch("/api/workspace"),
      fetch("/api/workspace/members"),
      fetch("/api/workspace/invite"),
    ]);
    const wsData = await wsRes.json();
    const membersData = await membersRes.json();
    const invitesData = await invitesRes.json();
    setWorkspace(wsData.workspace);
    setMembers(membersData.members ?? []);
    setInvites(invitesData.invites ?? []);
    setLoading(false);
  }

  async function createWorkspace() {
    if (!wsName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: wsName }) });
    const d = await res.json();
    setWorkspace(d.workspace);
    setCreating(false);
    loadAll();
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const res = await fetch("/api/workspace/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
    const d = await res.json();
    if (d.inviteUrl) {
      setGeneratedLink(d.inviteUrl);
      setInviteEmail("");
    }
    setInviting(false);
    loadAll();
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function updateMember(member_id: string, role: string) {
    await fetch("/api/workspace/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_id, role }) });
    loadAll();
  }

  async function removeMember(member_id: string) {
    await fetch("/api/workspace/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_id, status: "suspended" }) });
    loadAll();
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-sm text-[#737373]">Loading...</p></div>;

  return (
    <div className="flex-1 overflow-auto p-8 max-w-[800px]">
      <h1 className="text-[20px] font-semibold text-[#1A1A1A] mb-1">Workspace</h1>
      <p className="text-sm text-[#737373] mb-8">Invite your team, manage roles, share projects.</p>

      {!workspace ? (
        /* Create workspace */
        <div className="bg-white rounded-xl border border-[#E5E2DE] p-6 mb-6">
          <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Create Your Workspace</h2>
          <div className="flex gap-2">
            <input value={wsName} onChange={e => setWsName(e.target.value)} onKeyDown={e => e.key === "Enter" && createWorkspace()}
              placeholder="Workspace name (e.g. Anka Sphere)"
              className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]" />
            <button onClick={createWorkspace} disabled={creating}
              className="px-4 py-2 bg-[#E8521A] text-white text-sm font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-50">
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Workspace header */}
          <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[16px] font-semibold text-[#1A1A1A]">{workspace.name}</div>
                <div className="text-xs text-[#737373] mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""} · {invites.filter((i:any) => i.status === "pending").length} pending invite{invites.filter((i:any) => i.status === "pending").length !== 1 ? "s" : ""}</div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E8521A] text-white font-semibold">Owner</span>
            </div>
          </div>

          {/* Invite */}
          <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-6">
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Invite Team Member</h2>
            <div className="flex gap-2 mb-3">
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && sendInvite()}
                placeholder="Email address"
                className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]" />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] bg-white">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={sendInvite} disabled={inviting}
                className="px-4 py-2 bg-[#1A1A1A] text-white text-sm font-semibold rounded-lg hover:bg-[#333] disabled:opacity-50">
                {inviting ? "..." : "Invite"}
              </button>
            </div>

            {generatedLink && (
              <div className="bg-[#F7F5F2] rounded-lg p-3 flex items-center gap-2 mt-2">
                <span className="text-xs text-[#737373] flex-1 truncate">{generatedLink}</span>
                <button onClick={() => copyLink(generatedLink)}
                  className="text-xs font-semibold text-[#E8521A] hover:underline shrink-0">
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="bg-white rounded-xl border border-[#E5E2DE] p-5 mb-6">
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Members</h2>
            <div className="space-y-2">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-[#F7F5F2] last:border-0">
                  <div className="w-8 h-8 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(m.profiles?.full_name ?? m.invited_email ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A]">{m.profiles?.full_name ?? m.invited_email ?? "Unknown"}</div>
                    <div className="text-xs text-[#737373]">joined {new Date(m.joined_at).toLocaleDateString()}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_COLORS[m.role] ?? ROLE_COLORS.agent}`}>{m.role}</span>
                  {m.role !== "owner" && (
                    <select value={m.role} onChange={e => updateMember(m.id, e.target.value)}
                      className="text-xs px-2 py-1 border border-[#E5E2DE] rounded-lg bg-white focus:outline-none">
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                  {m.role !== "owner" && (
                    <button onClick={() => removeMember(m.id)} className="text-xs text-[#EF4444] hover:underline">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pending invites */}
          {invites.filter((i:any) => i.status === "pending").length > 0 && (
            <div className="bg-white rounded-xl border border-[#E5E2DE] p-5">
              <h2 className="text-sm font-bold text-[#1A1A1A] mb-4">Pending Invites</h2>
              <div className="space-y-2">
                {invites.filter((i:any) => i.status === "pending").map((inv: any) => (
                  <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-[#F7F5F2] last:border-0">
                    <div className="flex-1">
                      <div className="text-sm text-[#1A1A1A]">{inv.email}</div>
                      <div className="text-xs text-[#737373]">expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_COLORS[inv.role] ?? ROLE_COLORS.agent}`}>{inv.role}</span>
                    <button onClick={() => copyLink(`${window.location.origin}/join?token=${inv.token}`)}
                      className="text-xs text-[#E8521A] hover:underline">Copy link</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

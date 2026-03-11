"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRole } from "@/hooks/useRole";
import TaskBoard from "@/components/dept/TaskBoard";
import ActivityFeed from "@/components/dept/ActivityFeed";
import MiniDashboard from "@/components/dept/MiniDashboard";
import { Plus, ChevronRight } from "lucide-react";

const ACCENT = "#10B981";

const CAMPAIGN_PLATFORMS = ["google", "meta", "tiktok", "linkedin", "email", "organic", "other"] as const;
const CAMPAIGN_STATUSES = ["draft", "active", "paused", "complete"] as const;
const LEAD_SOURCES = ["organic", "referral", "ad", "cold_outreach", "event", "other"] as const;
const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;
const PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "tiktok", "email", "other"] as const;
const CONTENT_TYPES = ["post", "reel", "story", "email", "blog", "ad", "video"] as const;

const LEAD_STATUS_COLORS: Record<string, string> = {
  new: "#3B82F6", contacted: "#F59E0B", qualified: "#8B5CF6", converted: "#10B981", lost: "#EF4444"
};
const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: "#737373", active: "#10B981", paused: "#F59E0B", complete: "#3B82F6"
};
const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C", facebook: "#1877F2", linkedin: "#0A66C2",
  youtube: "#FF0000", tiktok: "#000000", email: "#10B981", other: "#737373"
};

export default function MarketingDept() {
  const { isIntern, isDeptHead, isOwner } = useRole();
  const router = useRouter();
  const [dept, setDept] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [social, setSocial] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [wsId, setWsId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [tab, setTab] = useState<"tasks" | "clients" | "campaigns" | "leads" | "social" | "activity">("tasks");

  const [newCampaign, setNewCampaign] = useState({ title: "", platform: "meta", status: "draft", budget: "", start_date: "", end_date: "", brief: "" });
  const [newLead, setNewLead] = useState({ name: "", email: "", company: "", source: "organic", notes: "" });
  const [newSocial, setNewSocial] = useState({ title: "", content_type: "post", platform: "instagram", due_date: "", notes: "" });
  const [showForm, setShowForm] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: mem } = await supabase.from("memberships")
      .select("workspace_id, role").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!mem) return;
    setWsId(mem.workspace_id);
    setUserRole(mem.role);
    const { data: d } = await supabase.from("departments")
      .select("*").eq("workspace_id", mem.workspace_id).eq("slug", "marketing").maybeSingle();
    if (!d) return;
    setDept(d);
    await loadAll(d.id, user.id, mem.role, mem.workspace_id);
  }

  async function loadAll(deptId: string, uid: string, role: string, workspace_id: string) {
    const isHead = role === "owner" || role === "dept_head";
    const [tRes, aRes, mRes] = await Promise.all([
      supabase.from("project_tasks").select("*").eq("department_id", deptId).neq("status", "cancelled").order("created_at", { ascending: false }),
      supabase.from("department_activity").select("*").eq("department_id", deptId).order("created_at", { ascending: false }).limit(30),
      supabase.from("memberships").select("*").eq("department_id", deptId),
    ]);
    setTasks(tRes.data ?? []);
    setActivity(aRes.data ?? []);
    setMembers(mRes.data ?? []);

    const cRes = await fetch("/api/clients").then(r => r.json());
    setClients(cRes.clients ?? []);

    const [cpRes, lRes, sRes] = await Promise.all([
      supabase.from("marketing_campaigns").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }),
      supabase.from("marketing_leads").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }),
      supabase.from("social_content").select("*").eq("workspace_id", workspace_id).order("due_date", { ascending: true }),
    ]);
    setCampaigns(cpRes.data ?? []);
    setLeads(lRes.data ?? []);
    setSocial(sRes.data ?? []);
  }

  async function addCampaign() {
    if (!newCampaign.title.trim() || !wsId) return;
    await supabase.from("marketing_campaigns").insert({
      ...newCampaign,
      budget: newCampaign.budget ? parseFloat(newCampaign.budget) : null,
      workspace_id: wsId, department_id: dept?.id
    });
    setNewCampaign({ title: "", platform: "meta", status: "draft", budget: "", start_date: "", end_date: "", brief: "" });
    setShowForm(null);
    await loadAll(dept.id, userId, userRole, wsId);
  }

  async function addLead() {
    if (!newLead.name.trim() || !wsId) return;
    await supabase.from("marketing_leads").insert({ ...newLead, workspace_id: wsId, department_id: dept?.id, status: "new" });
    setNewLead({ name: "", email: "", company: "", source: "organic", notes: "" });
    setShowForm(null);
    await loadAll(dept.id, userId, userRole, wsId);
  }

  async function updateLeadStatus(id: string, status: string) {
    await supabase.from("marketing_leads").update({ status }).eq("id", id);
    await loadAll(dept.id, userId, userRole, wsId);
  }

  async function addSocial() {
    if (!newSocial.title.trim() || !wsId) return;
    await supabase.from("social_content").insert({ ...newSocial, workspace_id: wsId, department_id: dept?.id, status: "draft" });
    setNewSocial({ title: "", content_type: "post", platform: "instagram", due_date: "", notes: "" });
    setShowForm(null);
    await loadAll(dept.id, userId, userRole, wsId);
  }

  const isHead = userRole === "owner" || userRole === "dept_head";
  const converted = leads.filter(l => l.status === "converted").length;
  const convRate = leads.length > 0 ? Math.round((converted / leads.length) * 100) : 0;

  const tabs = isIntern
    ? ["tasks", "social"]
    : isHead
    ? ["tasks", "clients", "campaigns", "leads", "social", "activity"]
    : ["tasks", "campaigns", "leads", "social", "activity"];

  if (!dept) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[960px]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${ACCENT}20` }}>📣</div>
          <div>
            <h1 className="text-[20px] font-semibold">Marketing</h1>
            <p className="text-xs text-[#737373]">
              Campaigns · Content · Growth · {members.length} member{members.length !== 1 ? "s" : ""}
              {userRole && userRole !== "owner" && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-white text-[9px] font-bold"
                  style={{ backgroundColor: ACCENT }}>
                  {userRole === "dept_head" ? "DEPT HEAD" : userRole === "executive" ? "EXECUTIVE" : "INTERN"}
                </span>
              )}
            </p>
          </div>
        </div>

        <MiniDashboard
          totalTasks={tasks.length}
          inProgress={tasks.filter(t => t.status === "in_progress").length}
          done={tasks.filter(t => t.status === "done").length}
          todo={tasks.filter(t => t.status === "todo").length}
          memberCount={members.length}
          lastActivity={activity[0]?.title ?? null}
          accentColor={ACCENT}
        />

        {/* Tool links */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { name: "Google Ads", icon: "📊", url: "https://ads.google.com" },
            { name: "Meta Ads",   icon: "📘", url: "https://business.facebook.com" },
            { name: "Mailchimp",  icon: "📧", url: "https://mailchimp.com" },
            { name: "Analytics",  icon: "📈", url: "https://analytics.google.com" },
          ].map(t => (
            <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
              className="bg-white border border-[#E5E2DE] rounded-xl p-3 flex items-center gap-2 hover:border-[#10B981] transition-colors">
              <span className="text-lg">{t.icon}</span>
              <div className="text-xs font-semibold">{t.name}</div>
            </a>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[#F0EDE9] p-1 rounded-xl w-fit overflow-x-auto">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t as any)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors capitalize whitespace-nowrap
                ${tab === t ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#737373] hover:text-[#1A1A1A]"}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === "tasks" && dept && (
          <TaskBoard tasks={tasks} departmentId={dept.id} userId={userId}
            members={members} canSeeAll={isHead} canAssign={isHead}
            accentColor={ACCENT} onRefresh={() => loadAll(dept.id, userId, userRole, wsId)} />
        )}

        {tab === "clients" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold">{clients.length} client{clients.length !== 1 ? "s" : ""}</div>
              {(isOwner || isDeptHead) && (
                <button onClick={() => router.push("/app/clients")}
                  className="text-xs text-[#10B981] hover:underline flex items-center gap-1">
                  Manage all <ChevronRight size={11} />
                </button>
              )}
            </div>
            <div className="space-y-2">
              {clients.map(c => (
                <div key={c.id} onClick={() => router.push(`/app/clients/${c.id}`)}
                  className="bg-white rounded-xl border border-[#E5E2DE] p-4 flex items-center gap-3 cursor-pointer hover:shadow-sm hover:border-[#10B981] transition-all">
                  <div className="w-8 h-8 rounded-lg bg-[#10B981] flex items-center justify-center text-white text-xs font-bold">
                    {c.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-[10px] text-[#737373]">{c.industry}</div>
                  </div>
                  <ChevronRight size={13} className="text-[#B0ADA9]" />
                </div>
              ))}
              {clients.length === 0 && <p className="text-sm text-[#737373] py-6 text-center">No clients visible yet</p>}
            </div>
          </div>
        )}

        {tab === "campaigns" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold">{campaigns.filter(c => c.status === "active").length} active campaigns</div>
              {isHead && (
                <button onClick={() => setShowForm(showForm === "campaign" ? null : "campaign")}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#10B981] text-white rounded-lg font-semibold hover:bg-[#059669]">
                  <Plus size={12} /> New Campaign
                </button>
              )}
            </div>
            {showForm === "campaign" && (
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input value={newCampaign.title} onChange={e => setNewCampaign(p => ({ ...p, title: e.target.value }))}
                    placeholder="Campaign title *" className="col-span-2 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
                  <select value={newCampaign.platform} onChange={e => setNewCampaign(p => ({ ...p, platform: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none capitalize">
                    {CAMPAIGN_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={newCampaign.status} onChange={e => setNewCampaign(p => ({ ...p, status: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none capitalize">
                    {CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="number" value={newCampaign.budget} onChange={e => setNewCampaign(p => ({ ...p, budget: e.target.value }))}
                    placeholder="Budget ($)" className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
                  <input type="date" value={newCampaign.start_date} onChange={e => setNewCampaign(p => ({ ...p, start_date: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none" />
                  <textarea value={newCampaign.brief} onChange={e => setNewCampaign(p => ({ ...p, brief: e.target.value }))}
                    placeholder="Campaign brief..." rows={2}
                    className="col-span-2 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={addCampaign} disabled={!newCampaign.title.trim()}
                    className="px-4 py-2 bg-[#10B981] text-white text-xs font-semibold rounded-xl disabled:opacity-40">Add Campaign</button>
                  <button onClick={() => setShowForm(null)} className="px-4 py-2 bg-[#F0EDE9] text-[#737373] text-xs font-semibold rounded-xl">Cancel</button>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {campaigns.map(c => (
                <div key={c.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm">{c.title}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full text-white font-semibold capitalize"
                        style={{ backgroundColor: CAMPAIGN_STATUS_COLORS[c.status] ?? "#737373" }}>{c.status}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F0EDE9] text-[#737373] capitalize">{c.platform}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-[#737373]">
                    {c.budget && <span className="font-semibold text-[#1A1A1A]">${Number(c.budget).toLocaleString()}</span>}
                    {c.start_date && <span>From {new Date(c.start_date).toLocaleDateString()}</span>}
                    {c.end_date && <span>To {new Date(c.end_date).toLocaleDateString()}</span>}
                  </div>
                  {c.brief && <p className="text-[11px] text-[#737373] mt-2 line-clamp-2">{c.brief}</p>}
                </div>
              ))}
              {campaigns.length === 0 && <p className="text-sm text-[#737373] py-6 text-center">No campaigns yet</p>}
            </div>
          </div>
        )}

        {tab === "leads" && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 text-center">
                <div className="text-2xl font-bold">{leads.length}</div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wide mt-0.5">Total Leads</div>
              </div>
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 text-center">
                <div className="text-2xl font-bold" style={{ color: ACCENT }}>{converted}</div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wide mt-0.5">Converted</div>
              </div>
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 text-center">
                <div className="text-2xl font-bold text-[#3B82F6]">{convRate}%</div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wide mt-0.5">Conv. Rate</div>
              </div>
            </div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold">{leads.filter(l => l.status === "new").length} new leads</div>
              <button onClick={() => setShowForm(showForm === "lead" ? null : "lead")}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#10B981] text-white rounded-lg font-semibold hover:bg-[#059669]">
                <Plus size={12} /> Add Lead
              </button>
            </div>
            {showForm === "lead" && (
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))}
                    placeholder="Name *" className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
                  <input value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))}
                    placeholder="Email" className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none" />
                  <input value={newLead.company} onChange={e => setNewLead(p => ({ ...p, company: e.target.value }))}
                    placeholder="Company" className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none" />
                  <select value={newLead.source} onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none capitalize">
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  <textarea value={newLead.notes} onChange={e => setNewLead(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Notes..." rows={2}
                    className="col-span-2 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={addLead} disabled={!newLead.name.trim()}
                    className="px-4 py-2 bg-[#10B981] text-white text-xs font-semibold rounded-xl disabled:opacity-40">Add Lead</button>
                  <button onClick={() => setShowForm(null)} className="px-4 py-2 bg-[#F0EDE9] text-[#737373] text-xs font-semibold rounded-xl">Cancel</button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {leads.map(l => (
                <div key={l.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: LEAD_STATUS_COLORS[l.status] ?? "#737373" }}>
                    {l.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-[10px] text-[#737373]">{l.company && `${l.company} · `}{l.source?.replace("_", " ")}</div>
                  </div>
                  <select value={l.status} onChange={e => updateLeadStatus(l.id, e.target.value)}
                    className="text-xs px-2 py-1.5 border rounded-lg bg-white focus:outline-none font-semibold capitalize"
                    style={{ borderColor: LEAD_STATUS_COLORS[l.status], color: LEAD_STATUS_COLORS[l.status] }}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
              {leads.length === 0 && <p className="text-sm text-[#737373] py-6 text-center">No leads yet</p>}
            </div>
          </div>
        )}

        {tab === "social" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-semibold">{social.filter(s => s.status === "scheduled").length} scheduled</div>
              <button onClick={() => setShowForm(showForm === "social" ? null : "social")}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#10B981] text-white rounded-lg font-semibold hover:bg-[#059669]">
                <Plus size={12} /> Add Content
              </button>
            </div>
            {showForm === "social" && (
              <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input value={newSocial.title} onChange={e => setNewSocial(p => ({ ...p, title: e.target.value }))}
                    placeholder="Content title *" className="col-span-2 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
                  <select value={newSocial.content_type} onChange={e => setNewSocial(p => ({ ...p, content_type: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none capitalize">
                    {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={newSocial.platform} onChange={e => setNewSocial(p => ({ ...p, platform: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl bg-white focus:outline-none capitalize">
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input type="date" value={newSocial.due_date} onChange={e => setNewSocial(p => ({ ...p, due_date: e.target.value }))}
                    className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none" />
                  <input value={newSocial.notes} onChange={e => setNewSocial(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Brief / notes" className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={addSocial} disabled={!newSocial.title.trim()}
                    className="px-4 py-2 bg-[#10B981] text-white text-xs font-semibold rounded-xl disabled:opacity-40">Schedule</button>
                  <button onClick={() => setShowForm(null)} className="px-4 py-2 bg-[#F0EDE9] text-[#737373] text-xs font-semibold rounded-xl">Cancel</button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {social.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-4 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[s.platform] ?? "#737373" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="text-[10px] text-[#737373] capitalize">{s.platform} · {s.content_type}</div>
                  </div>
                  {s.due_date && <span className="text-[10px] text-[#737373] shrink-0">{new Date(s.due_date).toLocaleDateString()}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize shrink-0
                    ${s.status === "published" ? "bg-[#10B98120] text-[#10B981]"
                      : s.status === "scheduled" ? "bg-[#3B82F620] text-[#3B82F6]"
                      : "bg-[#F0EDE9] text-[#737373]"}`}>{s.status}</span>
                </div>
              ))}
              {social.length === 0 && <p className="text-sm text-[#737373] py-6 text-center">No content scheduled yet</p>}
            </div>
          </div>
        )}

        {tab === "activity" && <ActivityFeed activity={activity} />}
      </div>
    </div>
  );
}

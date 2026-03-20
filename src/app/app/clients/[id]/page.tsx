"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Check, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

const STAGE_DEPT_COLORS: Record<string, string> = {
  content: "#F59E0B", seo: "#10B981", design: "#8B5CF6",
  development: "#3B82F6", marketing: "#B5622A"
};
const STATUS_STYLES: Record<string, string> = {
  not_started: "bg-[#F0EDE9] text-[#737373]",
  in_progress:  "bg-[#3B82F620] text-[#3B82F6]",
  review:       "bg-[#F59E0B20] text-[#F59E0B]",
  done:         "bg-[#10B98120] text-[#10B981]",
};
const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started", in_progress: "In Progress", review: "Review", done: "Done"
};
const STATUSES = ["not_started", "in_progress", "review", "done"] as const;
const TABS = ["Pipeline", "Keywords", "Access"] as const;

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]>("Pipeline");
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKw, setNewKw] = useState({ page_name: "", page_url: "", keywords: "" });
  const [addingKw, setAddingKw] = useState(false);
  const [savingStage, setSavingStage] = useState<string | null>(null);

  useEffect(() => { if (id) init(); }, [id]);

  async function init() {
    const [cRes, sRes, kRes, aRes] = await Promise.all([
      fetch("/api/clients").then(r => r.json()),
      fetch(`/api/clients/stages?client_id=${id}`).then(r => r.json()),
      fetch(`/api/clients/keywords?client_id=${id}`).then(r => r.json()),
      fetch(`/api/clients/access?client_id=${id}`).then(r => r.json()),
    ]);
    const found = (cRes.clients ?? []).find((c: any) => c.id === id);
    setClient(found ?? null);
    setStages(sRes.stages ?? []);
    setKeywords(kRes.keywords ?? []);
    setAccess(aRes.access ?? []);

    // Load workspace members for access control
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
      if (ws) {
        const { data: mem } = await supabase.from("memberships")
          .select("*").eq("workspace_id", ws.id).neq("status", "suspended").neq("role", "owner");
        setMembers(mem ?? []);
      }
    }
    setLoading(false);
  }

  async function updateStage(stage: any, updates: Partial<any>) {
    setSavingStage(stage.id);
    await fetch("/api/clients/stages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stage.id, ...updates })
    });
    const res = await fetch(`/api/clients/stages?client_id=${id}`);
    const data = await res.json();
    setStages(data.stages ?? []);
    setSavingStage(null);
  }

  async function addKeyword() {
    if (!newKw.page_name.trim()) return;
    setAddingKw(true);
    const kwArray = newKw.keywords.split(",").map(k => k.trim()).filter(Boolean).slice(0, 10);
    await fetch("/api/clients/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: id, page_name: newKw.page_name, page_url: newKw.page_url, keywords: kwArray, updated_at: new Date().toISOString() })
    });
    setNewKw({ page_name: "", page_url: "", keywords: "" });
    const res = await fetch(`/api/clients/keywords?client_id=${id}`);
    const data = await res.json();
    setKeywords(data.keywords ?? []);
    setAddingKw(false);
  }

  async function grantAccess(userId: string) {
    await fetch("/api/clients/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: id, user_id: userId })
    });
    const res = await fetch(`/api/clients/access?client_id=${id}`);
    const data = await res.json();
    setAccess(data.access ?? []);
  }

  async function revokeAccess(userId: string) {
    await fetch("/api/clients/access", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: id, user_id: userId })
    });
    const res = await fetch(`/api/clients/access?client_id=${id}`);
    const data = await res.json();
    setAccess(data.access ?? []);
  }

  const done = stages.filter(s => s.status === "done").length;
  const pct = stages.length > 0 ? Math.round((done / stages.length) * 100) : 0;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#B5622A] border-t-transparent animate-spin" />
    </div>
  );
  if (!client) return (
    <div className="flex-1 flex items-center justify-center text-[#737373]">Client not found</div>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-[#0F0F0F] text-white px-8 py-6">
        <div className="max-w-[1000px] mx-auto">
          <button onClick={() => router.push("/app/clients")}
            className="flex items-center gap-1.5 text-white/40 hover:text-white text-xs mb-4 transition-colors">
            <ArrowLeft size={12} /> All Clients
          </button>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#B5622A] flex items-center justify-center text-white font-bold text-lg">
                {client.name[0].toUpperCase()}
              </div>
              <div>
                <h1 className="text-[22px] font-bold">{client.name}</h1>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {client.industry && <span className="text-white/40 text-xs">{client.industry}</span>}
                  {client.location && <span className="text-white/40 text-xs">{client.location}</span>}
                  {client.website && (
                    <a href={client.website} target="_blank" rel="noopener noreferrer"
                      className="text-[#B5622A] text-xs flex items-center gap-1 hover:underline">
                      {client.website} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <div className="text-3xl font-bold text-[#B5622A]">{pct}%</div>
              <div className="text-white/40 text-[10px]">{done} of {stages.length} stages done</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#B5622A] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1000px] mx-auto">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[#E5E2DE] p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-xs font-semibold px-5 py-2 rounded-lg transition-colors
                ${tab === t ? "bg-[#0F0F0F] text-white" : "text-[#737373] hover:text-[#1A1A1A]"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Pipeline tab ──────────────────────────────────────────────── */}
        {tab === "Pipeline" && (
          <div className="space-y-2">
            {stages.map(stage => {
              const isOpen = expandedStage === stage.id;
              const color = STAGE_DEPT_COLORS[stage.department] ?? "#737373";
              return (
                <div key={stage.id} className="bg-white rounded-2xl border border-[#E5E2DE] overflow-hidden">
                  {/* Stage header */}
                  <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[#F7F5F2] transition-colors"
                    onClick={() => setExpandedStage(isOpen ? null : stage.id)}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: stage.status === "done" ? "#10B981" : color }}>
                      {stage.status === "done" ? <Check size={13} /> : stage.stage_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[#1A1A1A]">{stage.stage_name}</div>
                      <div className="text-[10px] mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded-md text-white text-[9px] font-bold capitalize"
                          style={{ backgroundColor: color }}>{stage.department}</span>
                        {stage.owner_email && <span className="text-[#737373]">{stage.owner_email}</span>}
                        {stage.completed_at && (
                          <span className="text-[#10B981]">
                            Completed {new Date(stage.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[stage.status]}`}>
                        {STATUS_LABELS[stage.status]}
                      </span>
                      {isOpen ? <ChevronUp size={14} className="text-[#B0ADA9]" /> : <ChevronDown size={14} className="text-[#B0ADA9]" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-[#F0EDE9] pt-4 space-y-3">
                      {/* Status selector */}
                      <div className="flex gap-2 flex-wrap">
                        {STATUSES.map(s => (
                          <button key={s} onClick={() => updateStage(stage, { status: s })}
                            disabled={savingStage === stage.id}
                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border
                              ${stage.status === s
                                ? `${STATUS_STYLES[s]} border-transparent`
                                : "bg-white text-[#737373] border-[#E5E2DE] hover:border-[#B0ADA9]"}`}>
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                      {/* Owner email */}
                      <input defaultValue={stage.owner_email ?? ""}
                        onBlur={e => { if (e.target.value !== (stage.owner_email ?? "")) updateStage(stage, { owner_email: e.target.value }); }}
                        placeholder="Assign owner email..."
                        className="w-full text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#B5622A]" />
                      {/* Notes */}
                      <textarea defaultValue={stage.notes ?? ""}
                        onBlur={e => { if (e.target.value !== (stage.notes ?? "")) updateStage(stage, { notes: e.target.value }); }}
                        placeholder="Add notes..."
                        rows={2}
                        className="w-full text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#B5622A] resize-none" />
                      {/* Attachment */}
                      <div className="flex gap-2">
                        <input defaultValue={stage.attachment_url ?? ""}
                          onBlur={e => { if (e.target.value !== (stage.attachment_url ?? "")) updateStage(stage, { attachment_url: e.target.value }); }}
                          placeholder="Attachment URL (Google Doc, Figma, Sheet...)"
                          className="flex-1 text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#B5622A]" />
                        <input defaultValue={stage.attachment_label ?? ""}
                          onBlur={e => { if (e.target.value !== (stage.attachment_label ?? "")) updateStage(stage, { attachment_label: e.target.value }); }}
                          placeholder="Label"
                          className="w-32 text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#B5622A]" />
                        {stage.attachment_url && (
                          <a href={stage.attachment_url} target="_blank" rel="noopener noreferrer"
                            className="px-3 py-2 bg-[#F0EDE9] rounded-xl text-[#B5622A] hover:bg-[#E5E2DE] transition-colors">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Keywords tab ──────────────────────────────────────────────── */}
        {tab === "Keywords" && (
          <div>
            {/* Add row */}
            <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 mb-4">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input value={newKw.page_name}
                  onChange={e => setNewKw(p => ({ ...p, page_name: e.target.value }))}
                  placeholder="Page name (e.g. Home)"
                  className="text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
                <input value={newKw.page_url}
                  onChange={e => setNewKw(p => ({ ...p, page_url: e.target.value }))}
                  placeholder="Page URL"
                  className="text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
                <input value={newKw.keywords}
                  onChange={e => setNewKw(p => ({ ...p, keywords: e.target.value }))}
                  placeholder="Keywords, comma separated (max 10)"
                  className="text-xs px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#10B981]" />
              </div>
              <button onClick={addKeyword} disabled={addingKw || !newKw.page_name.trim()}
                className="px-4 py-2 bg-[#10B981] text-white text-xs font-semibold rounded-xl disabled:opacity-40 hover:bg-[#059669]">
                {addingKw ? "Adding..." : "Add Page + Keywords"}
              </button>
            </div>

            {/* Keywords table */}
            {keywords.length === 0 ? (
              <div className="text-center py-12 text-[#B0ADA9] text-sm">No keywords added yet</div>
            ) : (
              <div className="space-y-3">
                {keywords.map(kw => (
                  <div key={kw.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-semibold text-sm text-[#1A1A1A]">{kw.page_name}</div>
                        {kw.page_url && (
                          <a href={kw.page_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-[#10B981] hover:underline flex items-center gap-1">
                            {kw.page_url} <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                      <span className="text-[10px] text-[#737373]">
                        Updated {new Date(kw.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(kw.keywords ?? []).map((k: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[#F0EDE9] rounded-lg">
                          <span className="text-xs text-[#1A1A1A]">{k}</span>
                          {kw.rankings?.[k] && (
                            <span className="text-[10px] font-bold text-[#10B981]">#{kw.rankings[k]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Access tab ────────────────────────────────────────────────── */}
        {tab === "Access" && (
          <div>
            <div className="bg-[#FAF5EF] border border-[#B5622A20] rounded-2xl p-4 mb-5 text-xs text-[#737373]">
              <span className="font-semibold text-[#B5622A]">Access Control: </span>
              Only members you grant access to can see this client profile. Executives and Interns are hidden by default.
            </div>
            <div className="space-y-2">
              {members.map((m: any) => {
                const hasAccess = access.some((a: any) => a.user_id === m.user_id);
                return (
                  <div key={m.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#B5622A] flex items-center justify-center text-white text-xs font-bold">
                      {(m.invited_email ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-[#1A1A1A]">{m.invited_email}</div>
                      <div className="text-[10px] text-[#737373] capitalize">{m.role?.replace("_", " ")}</div>
                    </div>
                    <button
                      onClick={() => hasAccess ? revokeAccess(m.user_id) : grantAccess(m.user_id)}
                      className={`text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors
                        ${hasAccess
                          ? "bg-[#10B98120] text-[#10B981] hover:bg-red-50 hover:text-red-500"
                          : "bg-[#F0EDE9] text-[#737373] hover:bg-[#B5622A] hover:text-white"}`}>
                      {hasAccess ? "✓ Has Access" : "Grant Access"}
                    </button>
                  </div>
                );
              })}
              {members.length === 0 && (
                <div className="text-center py-8 text-[#B0ADA9] text-sm">No team members to grant access to</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; description: string | null; status: string; tags: string[] | null; updated_at: string; latestUpdate?: string | null; };
type Decision = { id: string; context: string; verdict: string | null; probability: number | null; created_at: string; };
type Rule = { id: string; rule_text: string; severity: number; active: boolean; };

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }
function VerdictBadge({ verdict }: { verdict: string | null }) {
  const map: Record<string, { label: string; cls: string }> = { enter: { label: "Enter", cls: "bg-[#DCFCE7] text-[#2D6A4F]" }, wait: { label: "Wait", cls: "bg-[#FEF9C3] text-[#92400E]" }, do_not_enter: { label: "Do Not Enter", cls: "bg-[#FEE2E2] text-[#EF4444]" } };
  const v = map[verdict ?? ""] ?? { label: verdict ?? "—", cls: "bg-[#F7F5F2] text-[#737373]" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${v.cls}`}>{v.label}</span>;
}
function SeverityBadge({ severity }: { severity: number }) {
  const map: Record<number, { label: string; cls: string }> = { 1: { label: "Low", cls: "bg-[#F7F5F2] text-[#737373]" }, 2: { label: "Medium", cls: "bg-[#FEF9C3] text-[#92400E]" }, 3: { label: "High", cls: "bg-[#FEE2E2] text-[#EF4444]" } };
  const s = map[severity] ?? map[1];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${s.cls}`}>{s.label}</span>;
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { active: "bg-[#DCFCE7] text-[#2D6A4F]", paused: "bg-[#FEF9C3] text-[#92400E]", archived: "bg-[#F7F5F2] text-[#737373]" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[status] ?? map.archived}`}>{status}</span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [commandInput, setCommandInput] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: proj } = await supabase.from("projects").select("*").eq("user_id", user.id).eq("status", "active").order("updated_at", { ascending: false });
      if (proj) {
        const withUpdates = await Promise.all(proj.map(async (p) => {
          const { data: u } = await supabase.from("project_updates").select("content").eq("project_id", p.id).order("created_at", { ascending: false }).limit(1);
          return { ...p, latestUpdate: u?.[0]?.content ?? null };
        }));
        setProjects(withUpdates);
      }
      const { data: dec } = await supabase.from("decisions").select("id, context, verdict, probability, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3);
      setDecisions(dec ?? []);
      const { data: rul } = await supabase.from("rules").select("id, rule_text, severity, active").eq("user_id", user.id).eq("active", true).order("severity", { ascending: false }).limit(4);
      setRules(rul ?? []);
    }
    load();
  }, []);

  async function generateSummary() {
    setSummaryLoading(true);
    setShowSummary(true);
    const res = await fetch("/api/summary", { method: "POST" });
    const data = await res.json();
    setSummary(data.summary ?? "Failed to generate.");
    setSummaryLoading(false);
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-[1200px] flex flex-col min-h-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Dashboard</h1>
            <p className="text-[12px] text-[#737373] mt-1">What's happening across all your work right now</p>
          </div>
          <button onClick={generateSummary} disabled={summaryLoading}
            className="flex items-center gap-2 px-4 py-2 border border-[#E5E2DE] text-[#737373] text-[13px] rounded-lg hover:border-[#CC785C] hover:text-[#CC785C] transition-colors disabled:opacity-50">
            {summaryLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Weekly Summary
          </button>
        </div>

        {/* Weekly Summary Panel */}
        {showSummary && (
          <div className="bg-[#1A1A1A] rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-[#CC785C]" />
                <span className="text-[11px] font-semibold text-[#CC785C] uppercase tracking-wide">Weekly Digest</span>
              </div>
              <button onClick={() => setShowSummary(false)} className="text-[11px] text-[#666] hover:text-[#999]">Close</button>
            </div>
            {summaryLoading ? (
              <div className="flex items-center gap-2"><Loader2 size={13} className="animate-spin text-[#CC785C]" /><span className="text-[13px] text-[#999]">Generating digest...</span></div>
            ) : (
              <p className="text-[13px] text-[#CCC] leading-relaxed whitespace-pre-wrap">{summary}</p>
            )}
          </div>
        )}

        <div className="flex gap-6 flex-1">
          {/* Left — Projects */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Active Projects</h2>
              <span className="text-[12px] text-[#737373]">{projects.length} active</span>
            </div>
            {projects.length === 0 ? (
              <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl p-10 text-center">
                <p className="text-[13px] text-[#737373]">No active projects yet.</p>
                <button onClick={() => router.push("/app/projects")} className="mt-3 text-[12px] text-[#CC785C] hover:text-[#b5684e]">Create one →</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {projects.map(p => (
                  <div key={p.id} onClick={() => router.push(`/app/projects/${p.id}`)}
                    className="bg-white border border-[#E5E2DE] rounded-xl p-5 cursor-pointer hover:border-[#CC785C]/40 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-[14px] font-semibold text-[#1A1A1A] leading-tight">{p.name}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    {p.description && <p className="text-[12px] text-[#737373] mb-2 line-clamp-1">{p.description}</p>}
                    {p.latestUpdate && <p className="text-[12px] text-[#404040] line-clamp-2 mb-2">{p.latestUpdate}</p>}
                    <div className="flex items-center justify-between mt-2">
                      {p.tags && p.tags.length > 0 && (
                        <div className="flex gap-1">{p.tags.slice(0,2).map(t => <span key={t} className="text-[10px] bg-[#F7F5F2] text-[#737373] px-2 py-0.5 rounded-full">{t}</span>)}</div>
                      )}
                      <span className="text-[11px] text-[#737373] ml-auto">{timeAgo(p.updated_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right — Decisions + Rules */}
          <div className="w-[340px] shrink-0 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Recent Decisions</h2>
                <button onClick={() => router.push("/app/decisions")} className="text-[12px] text-[#CC785C] hover:text-[#b5684e]">View all</button>
              </div>
              {decisions.length === 0 ? (
                <p className="text-[12px] text-[#737373]">No decisions logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {decisions.map(d => (
                    <div key={d.id} onClick={() => router.push("/app/decisions")}
                      className="bg-white border border-[#E5E2DE] rounded-xl p-4 cursor-pointer hover:border-[#CC785C]/40 transition-colors">
                      <div className="flex items-center gap-2 mb-2">
                        <VerdictBadge verdict={d.verdict} />
                        {d.probability != null && <span className="text-[11px] text-[#737373]">{d.probability}%</span>}
                        <span className="text-[11px] text-[#737373] ml-auto">{timeAgo(d.created_at)}</span>
                      </div>
                      <p className="text-[13px] text-[#404040] line-clamp-2">{d.context}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Active Rules</h2>
                <button onClick={() => router.push("/app/rules")} className="text-[12px] text-[#CC785C] hover:text-[#b5684e]">View all</button>
              </div>
              {rules.length === 0 ? (
                <p className="text-[12px] text-[#737373]">No active rules yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {rules.map(r => (
                    <div key={r.id} onClick={() => router.push("/app/rules")}
                      className="flex items-center gap-3 bg-white border border-[#E5E2DE] rounded-lg px-4 py-2.5 cursor-pointer hover:border-[#CC785C]/40 transition-colors">
                      <p className="text-[12px] text-[#404040] flex-1 truncate">{r.rule_text}</p>
                      <SeverityBadge severity={r.severity} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom command bar */}
        <div className="mt-8 pt-4 border-t border-[#E5E2DE]">
          <span className="text-[11px] text-[#737373] uppercase tracking-wide mb-2 block">Quick Command</span>
          <div className="flex gap-3">
            <input className="flex-1 border border-[#E5E2DE] rounded-xl px-4 py-3 text-[13px] bg-white focus:outline-none focus:border-[#CC785C]/50 font-mono placeholder:text-[#999]"
              placeholder="Type a command or update..."
              value={commandInput} onChange={e => setCommandInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && commandInput.trim()) router.push(`/app/ai?q=${encodeURIComponent(commandInput)}`); }} />
            <button onClick={() => commandInput.trim() && router.push(`/app/ai?q=${encodeURIComponent(commandInput)}`)}
              className="bg-[#1A1A1A] text-white text-[13px] px-5 py-3 rounded-xl hover:bg-[#333] transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

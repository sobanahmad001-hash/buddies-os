"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Decision = { id: string; context: string; verdict: string | null; probability: number | null; domain: string | null; base_case: string | null; upside_case: string | null; downside_case: string | null; risk_flags: string[] | null; created_at: string; project_id: string | null; };
type Project = { id: string; name: string };

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }

function VerdictBadge({ verdict }: { verdict: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    enter: { label: "Enter", cls: "bg-[#DCFCE7] text-[#2D6A4F]" },
    wait: { label: "Wait", cls: "bg-[#FEF9C3] text-[#92400E]" },
    do_not_enter: { label: "Do Not Enter", cls: "bg-[#FEE2E2] text-[#EF4444]" },
  };
  const v = map[verdict ?? ""] ?? { label: verdict ?? "—", cls: "bg-[#F7F5F2] text-[#737373]" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${v.cls}`}>{v.label}</span>;
}

function DecisionCard({ d, projectName }: { d: Decision; projectName: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-[#E5E2DE] rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={d.verdict} />
          {d.probability != null && <span className="text-[12px] text-[#737373]">{d.probability}% confidence</span>}
        </div>
        <span className="text-[12px] text-[#737373]">{timeAgo(d.created_at)}</span>
      </div>
      <p className="text-[14px] text-[#404040] mb-3 leading-relaxed">{d.context}</p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {projectName && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] border border-[#E5E2DE]">{projectName}</span>}
        {d.domain && <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F7F5F2] text-[#737373] border border-[#E5E2DE]">{d.domain}</span>}
      </div>
      {d.risk_flags && d.risk_flags.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {d.risk_flags.map(f => <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-[#FEE2E2] text-[#EF4444]">{f}</span>)}
        </div>
      )}
      {(d.base_case || d.upside_case || d.downside_case) && (
        <>
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-[12px] text-[#CC785C] hover:text-[#b5684e] transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Hide cases" : "Show cases"}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 border-t border-[#E5E2DE] pt-3">
              {d.base_case && <div><span className="text-[11px] font-semibold text-[#2D6A4F] uppercase tracking-wide">Base Case</span><p className="text-[13px] text-[#737373] mt-1">{d.base_case}</p></div>}
              {d.upside_case && <div><span className="text-[11px] font-semibold text-[#2C5F8A] uppercase tracking-wide">Upside</span><p className="text-[13px] text-[#737373] mt-1">{d.upside_case}</p></div>}
              {d.downside_case && <div><span className="text-[11px] font-semibold text-[#EF4444] uppercase tracking-wide">Downside</span><p className="text-[13px] text-[#737373] mt-1">{d.downside_case}</p></div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DecisionsPage() {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: d } = await supabase.from("decisions").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setDecisions(d ?? []);
      const { data: p } = await supabase.from("projects").select("id, name").eq("user_id", user.id);
      setProjects(p ?? []);
    }
    load();
  }, []);

  const filtered = filter === "all" ? decisions : decisions.filter(d => d.verdict === filter);
  const projectName = (id: string | null) => projects.find(p => p.id === id)?.name ?? "";

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-[900px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Decisions</h1>
            <p className="text-[12px] text-[#737373] mt-1">{decisions.length} decisions logged with reasoning</p>
          </div>
          <div className="flex gap-2">
            {(["all", "enter", "wait", "do_not_enter"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-[11px] px-3 py-1 rounded-full border transition-colors capitalize ${filter === f ? "border-[#CC785C] text-[#CC785C] bg-[#CC785C]/5" : "border-[#E5E2DE] text-[#737373] hover:border-[#CC785C] hover:text-[#CC785C]"}`}>
                {f === "all" ? "All" : f === "do_not_enter" ? "No-go" : f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 text-center">
            <p className="text-[14px] text-[#737373]">No decisions yet. Use Command to log one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(d => <DecisionCard key={d.id} d={d} projectName={projectName(d.project_id)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

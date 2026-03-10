"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Scale, ChevronDown, ChevronUp, CheckCircle, Clock, X } from "lucide-react";

type Decision = {
  id: string; context: string; verdict: string | null; probability: number | null;
  base_case: string | null; upside_case: string | null; downside_case: string | null;
  risk_flags: string | null; expected_outcome: string | null; actual_outcome: string | null;
  outcome_rating: string | null; closed_at: string | null;
  review_date: string | null; created_at: string; domain: string | null;
};

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const h = Math.floor(diff/60000/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }

function VerdictBadge({ verdict }: { verdict: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    enter: { label: "Enter", cls: "bg-[#DCFCE7] text-[#2D6A4F]" },
    wait: { label: "Wait", cls: "bg-[#FEF9C3] text-[#92400E]" },
    do_not_enter: { label: "Do Not Enter", cls: "bg-[#FEE2E2] text-[#EF4444]" },
  };
  const v = map[verdict ?? ""] ?? { label: verdict ?? "—", cls: "bg-[#F7F5F2] text-[#737373]" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${v.cls}`}>{v.label}</span>;
}

function OutcomeBadge({ rating }: { rating: string | null }) {
  if (!rating || rating === "pending") return null;
  const map: Record<string, string> = { success: "bg-[#DCFCE7] text-[#2D6A4F]", failure: "bg-[#FEE2E2] text-[#EF4444]", mixed: "bg-[#FEF9C3] text-[#92400E]" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${map[rating] ?? ""}`}>{rating}</span>;
}

export default function DecisionsPage() {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [rating, setRating] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase.from("decisions").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setDecisions(data ?? []);
    }
    load();
  }, []);

  async function closeDecision(id: string) {
    if (!outcome || !rating) return;
    await supabase.from("decisions").update({
      actual_outcome: outcome,
      outcome_rating: rating,
      closed_at: new Date().toISOString(),
    }).eq("id", id);
    setDecisions(prev => prev.map(d => d.id === id ? { ...d, actual_outcome: outcome, outcome_rating: rating, closed_at: new Date().toISOString() } : d));
    setReviewing(null); setOutcome(""); setRating("");
  }

  const today = new Date().toISOString().split("T")[0];
  const filtered = decisions.filter(d => {
    if (filter === "open") return !d.closed_at;
    if (filter === "closed") return !!d.closed_at;
    if (filter === "review") return d.review_date && d.review_date <= today && !d.closed_at;
    return true;
  });

  const overdueCount = decisions.filter(d => d.review_date && d.review_date <= today && !d.closed_at).length;

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[18px] font-semibold text-[#1A1A1A]">Decisions</h1>
          <p className="text-[12px] text-[#737373] mt-0.5">{decisions.length} total · {decisions.filter(d => !d.closed_at).length} open</p>
        </div>
        {overdueCount > 0 && (
          <button onClick={() => setFilter("review")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FEF9C3] text-[#92400E] text-[12px] font-semibold rounded-lg border border-[#FDE68A]">
            <Clock size={12} /> {overdueCount} review due
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {["all", "open", "closed", "review"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-[12px] rounded-lg capitalize transition-colors ${filter === f ? "bg-[#1A1A1A] text-white" : "text-[#737373] hover:text-[#404040] bg-white border border-[#E5E2DE]"}`}>
            {f === "review" ? "Review Due" : f}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl p-8 text-center">
          <p className="text-[13px] text-[#737373]">No decisions here. Log them in AI Assistant.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(d => (
          <div key={d.id} className={`bg-white border rounded-xl overflow-hidden transition-all ${d.closed_at ? "border-[#E5E2DE] opacity-75" : "border-[#E5E2DE] hover:border-[#CC785C]/40"}`}>
            <div className="px-4 py-3 cursor-pointer" onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <Scale size={14} className="text-[#2C5F8A] shrink-0 mt-0.5" />
                  <p className="text-[13px] text-[#404040] leading-snug">{d.context}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <VerdictBadge verdict={d.verdict} />
                  <OutcomeBadge rating={d.outcome_rating} />
                  {d.probability != null && <span className="text-[10px] text-[#737373]">{d.probability}%</span>}
                  {expanded === d.id ? <ChevronUp size={14} className="text-[#737373]" /> : <ChevronDown size={14} className="text-[#737373]" />}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5 ml-6">
                <span className="text-[10px] text-[#737373]">{timeAgo(d.created_at)}</span>
                {d.review_date && !d.closed_at && (
                  <span className={`text-[10px] font-semibold ${d.review_date <= today ? "text-[#EF4444]" : "text-[#737373]"}`}>
                    review: {d.review_date}
                  </span>
                )}
                {d.closed_at && <span className="text-[10px] text-[#2D6A4F]">✓ Closed</span>}
              </div>
            </div>

            {expanded === d.id && (
              <div className="px-4 pb-4 border-t border-[#F7F5F2] pt-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {d.base_case && <div className="bg-[#F7F5F2] rounded-lg p-3"><p className="text-[10px] font-semibold text-[#737373] uppercase mb-1">Base Case</p><p className="text-[12px] text-[#404040]">{d.base_case}</p></div>}
                  {d.upside_case && <div className="bg-[#DCFCE7] rounded-lg p-3"><p className="text-[10px] font-semibold text-[#2D6A4F] uppercase mb-1">Upside</p><p className="text-[12px] text-[#404040]">{d.upside_case}</p></div>}
                  {d.downside_case && <div className="bg-[#FEE2E2] rounded-lg p-3"><p className="text-[10px] font-semibold text-[#EF4444] uppercase mb-1">Downside</p><p className="text-[12px] text-[#404040]">{d.downside_case}</p></div>}
                </div>
                {d.actual_outcome && (
                  <div className="bg-[#F0F9FF] rounded-lg p-3 border border-[#BAE6FD]">
                    <p className="text-[10px] font-semibold text-[#2C5F8A] uppercase mb-1">Actual Outcome</p>
                    <p className="text-[12px] text-[#404040]">{d.actual_outcome}</p>
                  </div>
                )}

                {/* Review / Close */}
                {!d.closed_at && (
                  reviewing === d.id ? (
                    <div className="space-y-2 pt-2 border-t border-[#E5E2DE]">
                      <p className="text-[11px] font-semibold text-[#1A1A1A]">Close this decision</p>
                      <textarea className="w-full border border-[#E5E2DE] rounded-lg px-3 py-2 text-[12px] outline-none focus:border-[#CC785C] resize-none"
                        rows={2} placeholder="What actually happened?" value={outcome} onChange={e => setOutcome(e.target.value)} />
                      <div className="flex gap-2">
                        {["success", "failure", "mixed"].map(r => (
                          <button key={r} onClick={() => setRating(r)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-colors ${rating === r ? "bg-[#1A1A1A] text-white" : "border border-[#E5E2DE] text-[#737373] hover:border-[#1A1A1A]"}`}>
                            {r}
                          </button>
                        ))}
                        <button onClick={() => closeDecision(d.id)} disabled={!outcome || !rating}
                          className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-[#2D6A4F] text-white text-[11px] font-semibold rounded-lg disabled:opacity-40">
                          <CheckCircle size={12} /> Save
                        </button>
                        <button onClick={() => setReviewing(null)} className="text-[#737373] hover:text-[#404040]"><X size={14} /></button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setReviewing(d.id)}
                      className="text-[11px] text-[#CC785C] font-semibold hover:underline">
                      Close decision with outcome →
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

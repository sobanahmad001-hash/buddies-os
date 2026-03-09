"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Rule = { id: string; rule_text: string; severity: number; domain: string; active: boolean; project_id: string | null; };
type Project = { id: string; name: string };
type Violation = { id: string; rule_id: string; notes: string; timestamp: string; };

function SeverityBadge({ severity }: { severity: number }) {
  const map: Record<number, { label: string; cls: string }> = { 1: { label: "Low", cls: "bg-[#F7F5F2] text-[#737373]" }, 2: { label: "Medium", cls: "bg-[#FEF9C3] text-[#92400E]" }, 3: { label: "High", cls: "bg-[#FEE2E2] text-[#EF4444]" } };
  const s = map[severity] ?? map[1];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function timeAgo(d: string) { const diff = Date.now() - new Date(d).getTime(); const m = Math.floor(diff/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; }

export default function RulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [violatingRule, setViolatingRule] = useState<string | null>(null);
  const [violationNote, setViolationNote] = useState("");
  const [form, setForm] = useState({ rule_text: "", project_id: "", severity: "2" });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const [{ data: r }, { data: p }, { data: v }] = await Promise.all([
      supabase.from("rules").select("*").eq("user_id", user.id).order("severity", { ascending: false }),
      supabase.from("projects").select("id, name").eq("user_id", user.id).eq("status", "active"),
      supabase.from("rule_violations").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(20),
    ]);
    setRules(r ?? []);
    setProjects(p ?? []);
    setViolations(v ?? []);
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id: string, active: boolean) {
    await supabase.from("rules").update({ active: !active }).eq("id", id);
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r));
  }

  async function handleCreate() {
    if (!form.rule_text.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("rules").insert({ user_id: user.id, rule_text: form.rule_text, severity: parseInt(form.severity), domain: "general", active: true, project_id: form.project_id || null });
    setForm({ rule_text: "", project_id: "", severity: "2" }); setShowForm(false);
    load();
  }

  async function handleViolation(ruleId: string) {
    if (!violationNote.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("rule_violations").insert({ user_id: user.id, rule_id: ruleId, notes: violationNote, timestamp: new Date().toISOString() });
    setViolatingRule(null); setViolationNote("");
    load();
  }

  const activeCount = rules.filter(r => r.active).length;
  const projectName = (id: string | null) => projects.find(p => p.id === id)?.name ?? "";
  const ruleViolations = (ruleId: string) => violations.filter(v => v.rule_id === ruleId);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 max-w-[900px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Rules</h1>
            <p className="text-[12px] text-[#737373] mt-1">{activeCount} active · {violations.length} violations logged</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
            <Plus size={14} /> New Rule
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-4 space-y-3">
            <input value={form.rule_text} onChange={e => setForm({...form, rule_text: e.target.value})} placeholder="Rule text..."
              className="w-full border border-[#E5E2DE] rounded-lg px-4 py-2 text-[13px] outline-none focus:border-[#CC785C] placeholder:text-[#999]" />
            <div className="flex gap-3">
              <select value={form.project_id} onChange={e => setForm({...form, project_id: e.target.value})}
                className="flex-1 border border-[#E5E2DE] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#CC785C] bg-white text-[#404040]">
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})}
                className="border border-[#E5E2DE] rounded-lg px-3 py-2 text-[13px] outline-none bg-white text-[#404040]">
                <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">Add Rule</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] rounded-lg hover:border-[#CC785C] hover:text-[#CC785C] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 text-center">
            <p className="text-[14px] text-[#737373]">No rules yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id}>
                <div className={`flex items-center gap-4 px-5 py-3.5 bg-white border border-[#E5E2DE] rounded-xl transition-colors ${r.severity === 3 ? "border-l-[3px] border-l-[#EF4444]" : ""} ${!r.active ? "opacity-50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#404040] truncate">{r.rule_text}</p>
                    {ruleViolations(r.id).length > 0 && (
                      <p className="text-[11px] text-[#EF4444] mt-0.5">{ruleViolations(r.id).length} violation{ruleViolations(r.id).length > 1 ? "s" : ""} logged</p>
                    )}
                  </div>
                  {r.project_id && <span className="text-[12px] text-[#737373] shrink-0">{projectName(r.project_id)}</span>}
                  <SeverityBadge severity={r.severity} />
                  <button onClick={() => setViolatingRule(violatingRule === r.id ? null : r.id)}
                    className="text-[12px] px-3 py-1 rounded-lg border border-[#E5E2DE] text-[#737373] hover:border-[#EF4444] hover:text-[#EF4444] transition-colors shrink-0 flex items-center gap-1">
                    <AlertTriangle size={11} /> Broke it
                  </button>
                  <button onClick={() => handleToggle(r.id, r.active)}
                    className={`text-[12px] px-3 py-1 rounded-lg border transition-colors shrink-0 ${r.active ? "border-[#E5E2DE] text-[#737373] hover:border-[#EF4444] hover:text-[#EF4444]" : "border-[#E5E2DE] text-[#CC785C] hover:border-[#CC785C]"}`}>
                    {r.active ? "Disable" : "Enable"}
                  </button>
                </div>

                {/* Violation form */}
                {violatingRule === r.id && (
                  <div className="ml-4 mt-1 bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl p-4 space-y-2">
                    <p className="text-[12px] text-[#EF4444] font-semibold">Log violation</p>
                    <input value={violationNote} onChange={e => setViolationNote(e.target.value)}
                      placeholder="What happened? What triggered it?"
                      className="w-full border border-[#FEE2E2] rounded-lg px-3 py-2 text-[12px] outline-none bg-white focus:border-[#EF4444] placeholder:text-[#999]" />
                    <div className="flex gap-2">
                      <button onClick={() => handleViolation(r.id)} className="px-3 py-1.5 bg-[#EF4444] text-white text-[12px] font-semibold rounded-lg hover:bg-[#dc2626] transition-colors">Log it</button>
                      <button onClick={() => { setViolatingRule(null); setViolationNote(""); }} className="px-3 py-1.5 border border-[#FEE2E2] text-[#737373] text-[12px] rounded-lg">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recent violations */}
        {violations.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[14px] font-semibold text-[#1A1A1A] mb-4">Recent Violations</h2>
            <div className="space-y-2">
              {violations.slice(0,5).map(v => {
                const rule = rules.find(r => r.id === v.rule_id);
                return (
                  <div key={v.id} className="bg-white border border-[#E5E2DE] border-l-[3px] border-l-[#EF4444] rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[12px] text-[#737373] truncate">{rule?.rule_text ?? "Unknown rule"}</p>
                      <span className="text-[11px] text-[#737373] shrink-0 ml-3">{timeAgo(v.timestamp)}</span>
                    </div>
                    <p className="text-[13px] text-[#404040]">{v.notes}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

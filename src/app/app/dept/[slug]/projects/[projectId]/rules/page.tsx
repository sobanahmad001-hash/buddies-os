"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ShieldCheck, Plus, Trash2 } from "lucide-react";

const DEPT_META: Record<string, { color: string }> = {
  design: { color: "#8B5CF6" }, development: { color: "#3B82F6" }, marketing: { color: "#10B981" },
};
const SEVERITY = { 1: { label: "Low", color: "#10B981" }, 2: { label: "Medium", color: "#F59E0B" }, 3: { label: "High", color: "#EF4444" } };

export default function DeptProjectRulesPage() {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const [rules, setRules] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState(2);
  const meta = DEPT_META[slug] ?? { color: "#E8521A" };

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/dept/${slug}/projects/${projectId}/rules`);
    const data = await res.json();
    setRules(data.rules ?? []);
  }

  async function create() {
    if (!text.trim()) return;
    await fetch(`/api/dept/${slug}/projects/${projectId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, rule_text: text.trim(), severity }),
    });
    setText(""); setSeverity(2); load();
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/dept/${slug}/projects/${projectId}/rules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r));
  }

  async function del(id: string) {
    await fetch(`/api/dept/${slug}/projects/${projectId}/rules?id=${id}`, { method: "DELETE" });
    setRules(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      <div className="px-8 py-6 max-w-[800px]">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck size={16} style={{ color: meta.color }} />
          <h2 className="text-sm font-bold text-[#1A1A1A]">Rules</h2>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-5 flex gap-3 items-end">
          <div className="flex-1">
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && create()}
              placeholder="Add a rule..." className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none" />
          </div>
          <select value={severity} onChange={e => setSeverity(Number(e.target.value))}
            className="text-sm border border-[#E5E2DE] rounded-xl px-3 py-2 bg-white focus:outline-none">
            <option value={1}>Low</option>
            <option value={2}>Medium</option>
            <option value={3}>High</option>
          </select>
          <button onClick={create} disabled={!text.trim()}
            className="px-4 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-40"
            style={{ background: meta.color }}>Add</button>
        </div>

        <div className="space-y-2">
          {rules.length === 0 ? (
            <div className="text-center py-12 text-[#B0ADA9] text-sm">No rules yet</div>
          ) : rules.map(r => {
            const sev = SEVERITY[r.severity as 1|2|3] ?? SEVERITY[2];
            return (
              <div key={r.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-3 group transition-opacity ${!r.active ? "opacity-50" : ""} border-[#E5E2DE]`}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sev.color }} />
                <span className="flex-1 text-sm text-[#1A1A1A]">{r.rule_text}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sev.color + "20", color: sev.color }}>{sev.label}</span>
                <button onClick={() => toggle(r.id, r.active)} className="text-xs text-[#737373] hover:text-[#1A1A1A] transition-colors">
                  {r.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => del(r.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-[#B0ADA9] hover:text-red-500 transition-all ml-1">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

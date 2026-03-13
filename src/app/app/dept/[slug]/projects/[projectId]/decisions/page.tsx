"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Scale, Plus, Trash2 } from "lucide-react";

const DEPT_META: Record<string, { color: string }> = {
  design: { color: "#8B5CF6" }, development: { color: "#3B82F6" }, marketing: { color: "#10B981" },
};

export default function DeptProjectDecisionsPage() {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const [decisions, setDecisions] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", context: "", verdict: "" });
  const [showForm, setShowForm] = useState(false);
  const meta = DEPT_META[slug] ?? { color: "#E8521A" };

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/dept/${slug}/projects/${projectId}/decisions`);
    const data = await res.json();
    setDecisions(data.decisions ?? []);
  }

  async function create() {
    if (!form.title.trim() || !form.context.trim()) return;
    await fetch(`/api/dept/${slug}/projects/${projectId}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectId }),
    });
    setForm({ title: "", context: "", verdict: "" });
    setShowForm(false);
    load();
  }

  async function del(id: string) {
    await fetch(`/api/dept/${slug}/projects/${projectId}/decisions?id=${id}`, { method: "DELETE" });
    setDecisions(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      <div className="px-8 py-6 max-w-[800px]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Scale size={16} style={{ color: meta.color }} />
            <h2 className="text-sm font-bold text-[#1A1A1A]">Decisions</h2>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
            style={{ background: meta.color }}>
            <Plus size={12} /> New Decision
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-4 space-y-3">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Decision title..." className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none" autoFocus />
            <textarea value={form.context} onChange={e => setForm(f => ({ ...f, context: e.target.value }))}
              placeholder="Context / why this decision matters..." rows={3}
              className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none resize-none" />
            <input value={form.verdict} onChange={e => setForm(f => ({ ...f, verdict: e.target.value }))}
              placeholder="Verdict (optional)..." className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={create} className="px-4 py-2 text-white text-sm font-semibold rounded-xl" style={{ background: meta.color }}>Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-[#E5E2DE] rounded-xl text-[#737373]">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {decisions.length === 0 ? (
            <div className="text-center py-12 text-[#B0ADA9] text-sm">No decisions logged yet</div>
          ) : decisions.map(d => (
            <div key={d.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#1A1A1A] text-sm">{d.title}</h3>
                  <p className="text-xs text-[#737373] mt-1">{d.context}</p>
                  {d.verdict && <p className="text-xs mt-2 font-medium" style={{ color: meta.color }}>→ {d.verdict}</p>}
                  {d.outcome && <p className="text-xs mt-1 text-[#737373] italic">Outcome: {d.outcome}</p>}
                  <p className="text-[10px] text-[#B0ADA9] mt-2">{new Date(d.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => del(d.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-all">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

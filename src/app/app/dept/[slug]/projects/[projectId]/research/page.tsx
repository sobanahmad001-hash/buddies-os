"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FlaskConical, Plus, Trash2 } from "lucide-react";

const DEPT_META: Record<string, { color: string }> = {
  design: { color: "#8B5CF6" }, development: { color: "#3B82F6" }, marketing: { color: "#10B981" },
};

export default function DeptProjectResearchPage() {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ topic: "", notes: "" });
  const [showForm, setShowForm] = useState(false);
  const meta = DEPT_META[slug] ?? { color: "#E8521A" };

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/dept/${slug}/projects/${projectId}/research`);
    const data = await res.json();
    setItems(data.research ?? []);
  }

  async function create() {
    if (!form.topic.trim() || !form.notes.trim()) return;
    await fetch(`/api/dept/${slug}/projects/${projectId}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectId }),
    });
    setForm({ topic: "", notes: "" }); setShowForm(false); load();
  }

  async function del(id: string) {
    await fetch(`/api/dept/${slug}/projects/${projectId}/research?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      <div className="px-8 py-6 max-w-[800px]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} style={{ color: meta.color }} />
            <h2 className="text-sm font-bold text-[#1A1A1A]">Research</h2>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
            style={{ background: meta.color }}>
            <Plus size={12} /> Add Research
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-4 space-y-3">
            <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
              placeholder="Topic..." className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none" autoFocus />
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Notes, findings, links..." rows={4}
              className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2 text-sm focus:outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={create} className="px-4 py-2 text-white text-sm font-semibold rounded-xl" style={{ background: meta.color }}>Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-[#E5E2DE] rounded-xl text-[#737373]">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-12 text-[#B0ADA9] text-sm">No research notes yet</div>
          ) : items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-[#E5E2DE] p-5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[#1A1A1A] text-sm mb-1">{item.topic}</h3>
                  <p className="text-xs text-[#737373] whitespace-pre-wrap">{item.notes}</p>
                  <p className="text-[10px] text-[#B0ADA9] mt-2">{new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => del(item.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-all">
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

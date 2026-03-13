"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Plus, Trash2, Edit2, Check, X } from "lucide-react";

const DEPT_META: Record<string, { color: string }> = {
  design: { color: "#8B5CF6" }, development: { color: "#3B82F6" }, marketing: { color: "#10B981" },
};

export default function DeptProjectDocumentsPage() {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const [docs, setDocs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const meta = DEPT_META[slug] ?? { color: "#E8521A" };

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/dept/${slug}/projects/${projectId}/documents`);
    const data = await res.json();
    setDocs(data.documents ?? []);
  }

  async function create() {
    if (!form.title.trim() || !form.content.trim()) return;
    await fetch(`/api/dept/${slug}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectId }),
    });
    setForm({ title: "", content: "" }); setShowForm(false); load();
  }

  async function del(id: string) {
    await fetch(`/api/dept/${slug}/projects/${projectId}/documents?id=${id}`, { method: "DELETE" });
    setDocs(prev => prev.filter(d => d.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F7F5F2]">
      {/* Sidebar list */}
      <div className="w-64 shrink-0 border-r border-[#E5E2DE] bg-white flex flex-col">
        <div className="p-4 border-b border-[#E5E2DE] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: meta.color }} />
            <span className="text-xs font-bold text-[#1A1A1A]">Documents</span>
          </div>
          <button onClick={() => { setShowForm(v => !v); setSelected(null); }}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white"
            style={{ background: meta.color }}>
            <Plus size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {docs.map(d => (
            <button key={d.id}
              onClick={() => { setSelected(d); setShowForm(false); setEditing(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selected?.id === d.id ? "bg-[#F7F5F2] font-medium text-[#1A1A1A]" : "text-[#737373] hover:bg-[#F7F5F2] hover:text-[#1A1A1A]"}`}>
              <div className="truncate">{d.title}</div>
              <div className="text-[10px] text-[#B0ADA9] mt-0.5">{new Date(d.created_at).toLocaleDateString()}</div>
            </button>
          ))}
          {docs.length === 0 && <p className="px-4 py-3 text-xs text-[#B0ADA9]">No documents yet</p>}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-auto p-8">
        {showForm ? (
          <div className="max-w-[700px] space-y-3">
            <h2 className="text-sm font-bold text-[#1A1A1A]">New Document</h2>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Document title..." className="w-full border border-[#E5E2DE] rounded-xl px-4 py-2.5 text-sm focus:outline-none" autoFocus />
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Document content..." rows={16}
              className="w-full border border-[#E5E2DE] rounded-xl px-4 py-3 text-sm focus:outline-none resize-none font-mono" />
            <div className="flex gap-2">
              <button onClick={create} className="px-4 py-2 text-white text-sm font-semibold rounded-xl" style={{ background: meta.color }}>Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-[#E5E2DE] rounded-xl text-[#737373]">Cancel</button>
            </div>
          </div>
        ) : selected ? (
          <div className="max-w-[700px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1A1A1A]">{selected.title}</h2>
              <div className="flex gap-2">
                <button onClick={() => del(selected.id)} className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="text-xs text-[#B0ADA9] mb-4">{new Date(selected.created_at).toLocaleString()}</p>
            <div className="text-sm text-[#404040] whitespace-pre-wrap leading-relaxed">{selected.content}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center text-[#B0ADA9]">
            <FileText size={32} className="mb-3 opacity-40" />
            <p className="text-sm">Select a document or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

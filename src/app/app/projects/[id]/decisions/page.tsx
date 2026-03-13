'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Scale, ChevronDown, ChevronUp } from 'lucide-react';

type Decision = {
  id: string;
  title: string;
  context: string;
  verdict: string | null;
  outcome: string | null;
  created_at: string;
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProjectDecisionsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', context: '', verdict: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/projects/decisions?projectId=${projectId}`);
    if (res.ok) { const d = await res.json(); setDecisions(d.decisions ?? []); }
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.context.trim()) return;
    setSaving(true);
    await fetch('/api/projects/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, ...form }),
    });
    setForm({ title: '', context: '', verdict: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  return (
    <div className="p-6 max-w-[860px]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
          Decisions
          <span className="text-[13px] font-normal text-[#737373] ml-2">{decisions.length} logged</span>
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors"
        >
          <Plus size={13} /> Log Decision
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-6 space-y-3">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Decision title"
            required
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]"
          />
          <textarea
            value={form.context}
            onChange={e => setForm(f => ({ ...f, context: e.target.value }))}
            placeholder="What is the context? What options were considered?"
            required
            rows={3}
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] resize-none"
          />
          <input
            value={form.verdict}
            onChange={e => setForm(f => ({ ...f, verdict: e.target.value }))}
            placeholder="Verdict / decision made (optional)"
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-[13px] text-[#737373] hover:text-[#1A1A1A] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 bg-[#E8521A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-[13px] text-[#737373]">Loading…</p>}

      {!loading && decisions.length === 0 && (
        <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 text-center">
          <Scale size={24} className="text-[#D1CCCC] mx-auto mb-3" />
          <p className="text-[14px] text-[#737373]">No decisions logged yet.</p>
          <p className="text-[12px] text-[#9E9E9E] mt-1">Log decisions here or the project assistant will auto-detect them from chat.</p>
        </div>
      )}

      <div className="space-y-3">
        {decisions.map(d => (
          <div key={d.id} className="bg-white border border-[#E5E2DE] rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              className="w-full flex items-start justify-between p-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#1A1A1A] truncate">{d.title}</p>
                <p className="text-[12px] text-[#737373] mt-0.5">{timeAgo(d.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                {d.verdict && (
                  <span className="text-[11px] px-2 py-0.5 bg-[#DCFCE7] text-[#2D6A4F] rounded-full font-medium">
                    {d.verdict.length > 30 ? d.verdict.slice(0, 30) + '…' : d.verdict}
                  </span>
                )}
                {expanded === d.id ? <ChevronUp size={14} className="text-[#737373]" /> : <ChevronDown size={14} className="text-[#737373]" />}
              </div>
            </button>
            {expanded === d.id && (
              <div className="px-4 pb-4 border-t border-[#F7F5F2] pt-3 space-y-2">
                <div>
                  <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Context</span>
                  <p className="text-[13px] text-[#404040] mt-1 leading-relaxed whitespace-pre-wrap">{d.context}</p>
                </div>
                {d.verdict && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Verdict</span>
                    <p className="text-[13px] text-[#404040] mt-1 pl-3 border-l-2 border-[#E8521A]">{d.verdict}</p>
                  </div>
                )}
                {d.outcome && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Outcome</span>
                    <p className="text-[13px] text-[#404040] mt-1 pl-3 border-l-2 border-[#2D6A4F]">{d.outcome}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

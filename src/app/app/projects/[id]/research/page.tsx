'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';

type ResearchNote = {
  id: string;
  topic: string;
  notes: string;
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

export default function ProjectResearchPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [notes,    setNotes]    = useState<ResearchNote[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ topic: '', notes: '' });
  const [saving,   setSaving]   = useState(false);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/projects/research?projectId=${projectId}`);
    if (res.ok) { const d = await res.json(); setNotes(d.research ?? []); }
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.topic.trim() || !form.notes.trim()) return;
    setSaving(true);
    await fetch('/api/projects/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, ...form }),
    });
    setForm({ topic: '', notes: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  return (
    <div className="p-6 max-w-[860px]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
          Research
          <span className="text-[13px] font-normal text-[#737373] ml-2">{notes.length} notes</span>
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors"
        >
          <Plus size={13} /> Add Note
        </button>
      </div>
      <p className="text-[13px] text-[#737373] mb-5">
        Plan what to do, capture findings, and guide the project assistant's execution.
      </p>

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-6 space-y-3">
          <input
            value={form.topic}
            onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
            placeholder="Research topic or question"
            required
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]"
          />
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes, findings, links, ideas…"
            required
            rows={5}
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-[13px] text-[#737373] hover:text-[#1A1A1A]">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 bg-[#E8521A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors">
              {saving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-[13px] text-[#737373]">Loading…</p>}

      {!loading && notes.length === 0 && (
        <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 text-center">
          <FlaskConical size={24} className="text-[#D1CCCC] mx-auto mb-3" />
          <p className="text-[14px] text-[#737373]">No research notes yet.</p>
          <p className="text-[12px] text-[#9E9E9E] mt-1">Add notes here to inform the project assistant's execution.</p>
        </div>
      )}

      <div className="space-y-3">
        {notes.map(note => (
          <div key={note.id} className="bg-white border border-[#E5E2DE] rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === note.id ? null : note.id)}
              className="w-full flex items-start justify-between p-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#1A1A1A]">{note.topic}</p>
                <p className="text-[12px] text-[#737373] mt-0.5 truncate">{note.notes.slice(0, 80)}{note.notes.length > 80 ? '…' : ''}</p>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className="text-[11px] text-[#737373]">{timeAgo(note.created_at)}</span>
                {expanded === note.id ? <ChevronUp size={14} className="text-[#737373]" /> : <ChevronDown size={14} className="text-[#737373]" />}
              </div>
            </button>
            {expanded === note.id && (
              <div className="px-4 pb-4 pt-2 border-t border-[#F7F5F2]">
                <p className="text-[14px] text-[#404040] leading-relaxed whitespace-pre-wrap">{note.notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

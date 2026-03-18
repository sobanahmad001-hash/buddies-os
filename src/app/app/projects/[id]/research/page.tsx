'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, FlaskConical, ChevronDown, ChevronUp, Sparkles, Check, X } from 'lucide-react';

type ResearchNote = { id: string; topic: string; notes: string; created_at: string; };
type SuggestedTask = { title: string; description: string; priority: number; };

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const PRIORITY_LABELS: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };
const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-[#FEE2E2] text-[#EF4444]', 2: 'bg-[#FEF3ED] text-[#E8521A]',
  3: 'bg-[#F0EDE9] text-[#737373]', 4: 'bg-[#F7F5F2] text-[#B0ADA9]',
};

export default function ProjectResearchPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ topic: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Task suggestion state
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<{ researchId: string; tasks: SuggestedTask[] } | null>(null);
  const [editableTasks, setEditableTasks] = useState<SuggestedTask[]>([]);
  const [approving, setApproving] = useState(false);

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

  async function suggestTasks(note: ResearchNote) {
    setSuggesting(note.id);
    setSuggested(null);
    try {
      const res = await fetch('/api/projects/research-to-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, researchId: note.id }),
      });
      const data = await res.json();
      if (data.suggested?.length) {
        setSuggested({ researchId: note.id, tasks: data.suggested });
        setEditableTasks(data.suggested);
        setExpanded(note.id);
      }
    } finally { setSuggesting(null); }
  }

  async function approveTasks() {
    if (!suggested || !editableTasks.length) return;
    setApproving(true);
    await fetch('/api/projects/research-to-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, approve: true, tasks: editableTasks }),
    });
    setSuggested(null);
    setEditableTasks([]);
    setApproving(false);
    alert(`${editableTasks.length} tasks created successfully.`);
  }

  return (
    <div className="p-6 max-w-[860px]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
          Research
          <span className="text-[13px] font-normal text-[#737373] ml-2">{notes.length} notes</span>
        </h2>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
          <Plus size={13} /> Add Note
        </button>
      </div>
      <p className="text-[13px] text-[#737373] mb-5">
        Capture findings and let Buddies suggest actionable tasks from your research.
      </p>

      {showForm && (
        <form onSubmit={submit} className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-6 space-y-3">
          <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
            placeholder="Research topic or question" required
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A]" />
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes, findings, links, ideas…" required rows={5}
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] resize-none" />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-[13px] text-[#737373] hover:text-[#1A1A1A]">Cancel</button>
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
        </div>
      )}

      <div className="space-y-3">
        {notes.map(note => (
          <div key={note.id} className="bg-white border border-[#E5E2DE] rounded-xl overflow-hidden">
            <div className="flex items-start justify-between p-4">
              <button onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                className="flex-1 text-left min-w-0">
                <p className="text-[14px] font-semibold text-[#1A1A1A]">{note.topic}</p>
                <p className="text-[12px] text-[#737373] mt-0.5 truncate">
                  {note.notes.slice(0, 80)}{note.notes.length > 80 ? '…' : ''}
                </p>
              </button>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className="text-[11px] text-[#737373]">{timeAgo(note.created_at)}</span>
                <button onClick={() => suggestTasks(note)} disabled={suggesting === note.id}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 bg-[#E8521A] text-white rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors">
                  <Sparkles size={11} />
                  {suggesting === note.id ? 'Thinking…' : 'Suggest Tasks'}
                </button>
                {expanded === note.id
                  ? <ChevronUp size={14} className="text-[#737373]" />
                  : <ChevronDown size={14} className="text-[#737373]" />}
              </div>
            </div>

            {expanded === note.id && (
              <div className="px-4 pb-4 pt-2 border-t border-[#F7F5F2] space-y-4">
                <p className="text-[14px] text-[#404040] leading-relaxed whitespace-pre-wrap">{note.notes}</p>

                {/* Task suggestions panel */}
                {suggested?.researchId === note.id && editableTasks.length > 0 && (
                  <div className="bg-[#F7F5F2] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[12px] font-semibold text-[#1A1A1A]">
                        AI suggested {editableTasks.length} tasks — review and approve
                      </p>
                      <button onClick={() => { setSuggested(null); setEditableTasks([]); }}
                        className="text-[#737373] hover:text-[#1A1A1A]"><X size={14} /></button>
                    </div>
                    <div className="space-y-2 mb-4">
                      {editableTasks.map((task, i) => (
                        <div key={i} className="bg-white border border-[#E5E2DE] rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <input value={task.title}
                                onChange={e => setEditableTasks(prev => prev.map((t, j) => j === i ? { ...t, title: e.target.value } : t))}
                                className="w-full text-[13px] font-semibold text-[#1A1A1A] bg-transparent focus:outline-none border-b border-transparent focus:border-[#E8521A]" />
                              {task.description && (
                                <p className="text-[11px] text-[#737373] mt-0.5">{task.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS[3]}`}>
                                {PRIORITY_LABELS[task.priority] ?? 'Medium'}
                              </span>
                              <button onClick={() => setEditableTasks(prev => prev.filter((_, j) => j !== i))}
                                className="text-[#B0ADA9] hover:text-[#EF4444] transition-colors">
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={approveTasks} disabled={approving || !editableTasks.length}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#10B981] text-white text-[12px] font-semibold rounded-lg hover:bg-[#059669] disabled:opacity-40 transition-colors">
                        <Check size={13} /> {approving ? 'Creating…' : `Approve All (${editableTasks.length})`}
                      </button>
                      <button onClick={() => { setSuggested(null); setEditableTasks([]); }}
                        className="px-4 py-2 bg-white border border-[#E5E2DE] text-[#737373] text-[12px] font-semibold rounded-lg hover:text-[#1A1A1A] transition-colors">
                        Discard
                      </button>
                    </div>
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

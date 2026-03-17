'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, FileText, Download, FolderKanban, X } from 'lucide-react';

type Doc = { id: string; title: string; content: string; created_at: string };

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProjectDocumentsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [docs,      setDocs]      = useState<Doc[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);
  const [viewing,   setViewing]   = useState<Doc | null>(null);
  const [form,      setForm]      = useState({ title: '', content: '' });
  const [saving,    setSaving]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const res = await fetch(`/api/projects/documents?projectId=${projectId}`);
    if (res.ok) { const d = await res.json(); setDocs(d.documents ?? []); }
    setLoading(false);
  }

  // Generate document content via AI then open in editor
  async function generate() {
    if (!projectId || !genPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/projects/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: `Generate a well-structured document about: ${genPrompt}. Return only the document content in clean markdown format.`,
          mode: 'document',
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setForm({ title: genPrompt, content: data.reply });
        setShowNew(true);
      }
    } finally {
      setGenerating(false);
      setGenPrompt('');
    }
  }

  // Save document to this project
  async function saveDoc() {
    if (!projectId || !form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    await fetch('/api/projects/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, title: form.title, content: form.content }),
    });
    setForm({ title: '', content: '' });
    setShowNew(false);
    setSaving(false);
    load();
  }

  // Download document as .md file (no DB save)
  function downloadDoc() {
    const blob = new Blob([`# ${form.title}\n\n${form.content}`], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${form.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadExisting(doc: Doc) {
    const blob = new Blob([`# ${doc.title}\n\n${doc.content}`], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${doc.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-[860px]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
          Documents
          <span className="text-[13px] font-normal text-[#737373] ml-2">{docs.length} saved</span>
        </h2>
        <button
          onClick={() => { setForm({ title: '', content: '' }); setShowNew(v => !v); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors"
        >
          <Plus size={13} /> New Document
        </button>
      </div>

      {/* AI generation prompt */}
      <div className="bg-[#FEF3ED] border border-[#FDBA9A] rounded-xl p-4 mb-5 flex gap-2">
        <input
          value={genPrompt}
          onChange={e => setGenPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder='Ask AI to generate a document… e.g. "Write a project brief"'
          className="flex-1 text-[13px] bg-transparent focus:outline-none placeholder-[#C4936A]"
        />
        <button
          onClick={generate}
          disabled={generating || !genPrompt.trim()}
          className="px-3 py-1 bg-[#E8521A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {/* New / Edit doc form */}
      {showNew && (
        <div className="bg-white border border-[#E8521A] rounded-xl p-5 mb-6 space-y-3">
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Document title"
            className="w-full text-[15px] font-semibold px-3 py-2 border-b border-[#E5E2DE] focus:outline-none focus:border-[#E8521A]"
          />
          <textarea
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="Document content (markdown supported)…"
            rows={14}
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] resize-none font-mono"
          />
          <div className="flex gap-2 justify-between items-center">
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="text-[13px] text-[#737373] hover:text-[#1A1A1A] flex items-center gap-1"
            >
              <X size={13} /> Discard
            </button>
            <div className="flex gap-2">
              <button
                onClick={downloadDoc}
                disabled={!form.content.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] font-semibold rounded-lg hover:border-[#1A1A1A] hover:text-[#1A1A1A] disabled:opacity-40 transition-colors"
              >
                <Download size={13} /> Download
              </button>
              <button
                onClick={saveDoc}
                disabled={saving || !form.title.trim() || !form.content.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#E8521A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors"
              >
                <FolderKanban size={13} /> Save to Project
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-[13px] text-[#737373]">Loading…</p>}

      {!loading && docs.length === 0 && !showNew && (
        <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-12 text-center">
          <FileText size={24} className="text-[#D1CCCC] mx-auto mb-3" />
          <p className="text-[14px] text-[#737373]">No documents saved yet.</p>
          <p className="text-[12px] text-[#9E9E9E] mt-1">Ask AI to generate a document above, or create one manually.</p>
        </div>
      )}

      {/* Document list */}
      <div className="space-y-3">
        {docs.map(doc => (
          <div key={doc.id} className="bg-white border border-[#E5E2DE] rounded-xl p-4 flex items-start justify-between gap-3">
            <button
              onClick={() => setViewing(doc)}
              className="flex-1 text-left min-w-0"
            >
              <p className="text-[14px] font-semibold text-[#1A1A1A] truncate">{doc.title}</p>
              <p className="text-[12px] text-[#737373] mt-0.5 truncate">{doc.content.slice(0, 80)}{doc.content.length > 80 ? '…' : ''}</p>
              <p className="text-[11px] text-[#9E9E9E] mt-1">{timeAgo(doc.created_at)}</p>
            </button>
            <button
              onClick={() => downloadExisting(doc)}
              title="Download as .md"
              className="shrink-0 p-2 text-[#737373] hover:text-[#1A1A1A] hover:bg-[#F7F5F2] rounded-lg transition-colors"
            >
              <Download size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Document viewer modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-[700px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E2DE]">
              <h3 className="text-[16px] font-semibold text-[#1A1A1A]">{viewing.title}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadExisting(viewing)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] rounded-lg hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-colors"
                >
                  <Download size={13} /> Download
                </button>
                <button onClick={() => setViewing(null)}
                  className="p-1.5 text-[#737373] hover:text-[#1A1A1A] rounded-lg hover:bg-[#F7F5F2]">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              <pre className="text-[14px] text-[#404040] leading-relaxed whitespace-pre-wrap font-sans">{viewing.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

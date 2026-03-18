'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, FileText, Download, X, Upload, File, RefreshCw, Pin } from 'lucide-react';

type Doc = {
  id: string; title: string; content: string; created_at: string;
  doc_type: string; is_living: boolean; auto_updated_at?: string; source: string;
};
type ProjectFile = {
  id: string; filename: string; file_type: string; file_size: number;
  summary: string; created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  living_product_doc: 'Living Doc', research_output: 'Research',
  task_summary: 'Tasks', user_requested: 'Generated', note: 'Note', file: 'File',
};
const TYPE_COLORS: Record<string, string> = {
  living_product_doc: 'bg-[#ECFDF5] text-[#10B981]',
  research_output: 'bg-[#EFF6FF] text-[#3B82F6]',
  task_summary: 'bg-[#F5F3FF] text-[#8B5CF6]',
  user_requested: 'bg-[#FEF3ED] text-[#E8521A]',
  note: 'bg-[#F7F5F2] text-[#737373]',
};

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`;
  return `${(b/1048576).toFixed(1)}MB`;
}

export default function ProjectDocumentsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'generated' | 'files'>('generated');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Doc | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [updatingLiving, setUpdatingLiving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const livingDoc = docs.find(d => d.is_living);
  const otherDocs = docs.filter(d => !d.is_living);

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    const [docsRes, filesRes] = await Promise.all([
      fetch(`/api/projects/documents?projectId=${projectId}`),
      fetch(`/api/projects/files?projectId=${projectId}`),
    ]);
    if (docsRes.ok) { const d = await docsRes.json(); setDocs(d.documents ?? []); }
    if (filesRes.ok) { const d = await filesRes.json(); setFiles(d.files ?? []); }
    setLoading(false);
  }

  async function refreshLivingDoc() {
    setUpdatingLiving(true);
    await fetch('/api/projects/living-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    await load();
    setUpdatingLiving(false);
  }

  async function generate() {
    if (!genPrompt.trim()) return;
    const ok = confirm(`Save a new document: "${genPrompt}"?\n\nBuddies will generate it and save it to this project.`);
    if (!ok) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/projects/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: `Generate a well-structured document about: ${genPrompt}. Return only the document content in clean markdown.`,
          mode: 'document',
        }),
      });
      const data = await res.json();
      if (data.reply) {
        await fetch('/api/projects/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId, title: genPrompt, content: data.reply,
            doc_type: 'user_requested', source: 'ai',
          }),
        });
        setGenPrompt('');
        await load();
      }
    } finally { setGenerating(false); }
  }

  async function saveManual() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    await fetch('/api/projects/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, title: form.title, content: form.content, doc_type: 'note', source: 'user' }),
    });
    setForm({ title: '', content: '' });
    setShowNew(false);
    setSaving(false);
    load();
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      await fetch('/api/projects/files', { method: 'POST', body: formData });
      await load();
      setTab('files');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function downloadDoc(doc: Doc) {
    const blob = new Blob([`# ${doc.title}\n\n${doc.content}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${doc.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-[860px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[16px] font-semibold text-[#1A1A1A]">
          Documents
          <span className="text-[13px] font-normal text-[#737373] ml-2">{docs.length} docs · {files.length} files</span>
        </h2>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" className="hidden"
            accept=".pdf,.txt,.md,.doc,.docx,.csv,.png,.jpg,.jpeg,.webp"
            onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] font-semibold rounded-lg hover:border-[#1A1A1A] hover:text-[#1A1A1A] disabled:opacity-40 transition-colors">
            <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload File'}
          </button>
          <button onClick={() => { setShowNew(v => !v); setTab('generated'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
            <Plus size={13} /> New
          </button>
        </div>
      </div>

      {/* Living doc pinned card */}
      {livingDoc && (
        <div className="bg-[#0F0F0F] text-white rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Pin size={12} className="text-[#E8521A]" />
              <span className="text-[11px] font-semibold text-[#E8521A] uppercase tracking-wide">Living Product Document</span>
              <span className="text-[10px] text-white/40">Auto-updates with project</span>
            </div>
            <div className="flex gap-2">
              <button onClick={refreshLivingDoc} disabled={updatingLiving}
                className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors">
                <RefreshCw size={11} className={updatingLiving ? 'animate-spin' : ''} />
                {updatingLiving ? 'Updating…' : 'Refresh'}
              </button>
              <button onClick={() => setViewing(livingDoc)}
                className="text-[11px] text-[#E8521A] hover:underline">View full →</button>
              <button onClick={() => downloadDoc(livingDoc)}
                className="text-[11px] text-white/50 hover:text-white transition-colors">
                <Download size={13} />
              </button>
            </div>
          </div>
          <p className="text-[12px] text-white/70 leading-relaxed line-clamp-3">
            {livingDoc.content.slice(0, 300)}…
          </p>
          {livingDoc.auto_updated_at && (
            <p className="text-[10px] text-white/30 mt-2">Last updated {timeAgo(livingDoc.auto_updated_at)}</p>
          )}
        </div>
      )}

      {!livingDoc && (
        <div className="bg-[#F7F5F2] border border-dashed border-[#E5E2DE] rounded-xl p-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-[#1A1A1A]">No Living Product Document yet</p>
            <p className="text-[12px] text-[#737373]">Auto-generated from your project data. Always current.</p>
          </div>
          <button onClick={refreshLivingDoc} disabled={updatingLiving}
            className="px-4 py-2 bg-[#E8521A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors">
            {updatingLiving ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}

      {/* AI generation bar */}
      <div className="bg-[#FEF3ED] border border-[#FDBA9A] rounded-xl p-3 mb-5 flex gap-2">
        <input value={genPrompt} onChange={e => setGenPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && generate()}
          placeholder='Ask AI to generate a document… e.g. "Write a competitor analysis"'
          className="flex-1 text-[13px] bg-transparent focus:outline-none placeholder-[#C4936A]" />
        <button onClick={generate} disabled={generating || !genPrompt.trim()}
          className="px-3 py-1.5 bg-[#E8521A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors whitespace-nowrap">
          {generating ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F0EDE9] p-1 rounded-xl w-fit mb-5">
        {(['generated', 'files'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-[12px] font-semibold px-4 py-1.5 rounded-lg transition-colors capitalize
              ${tab === t ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#737373] hover:text-[#1A1A1A]'}`}>
            {t === 'generated' ? `Documents (${otherDocs.length})` : `Files (${files.length})`}
          </button>
        ))}
      </div>

      {/* Manual new doc form */}
      {showNew && tab === 'generated' && (
        <div className="bg-white border border-[#E8521A] rounded-xl p-5 mb-5 space-y-3">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Document title"
            className="w-full text-[15px] font-semibold px-3 py-2 border-b border-[#E5E2DE] focus:outline-none focus:border-[#E8521A]" />
          <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="Document content (markdown)…" rows={10}
            className="w-full text-[14px] px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#E8521A] resize-none font-mono" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowNew(false)} className="text-[13px] text-[#737373] hover:text-[#1A1A1A] flex items-center gap-1">
              <X size={13} /> Discard
            </button>
            <button onClick={saveManual} disabled={saving || !form.title.trim() || !form.content.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#E8521A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-40 transition-colors">
              Save to Project
            </button>
          </div>
        </div>
      )}

      {loading && <p className="text-[13px] text-[#737373]">Loading…</p>}

      {/* Generated docs list */}
      {tab === 'generated' && (
        <div className="space-y-3">
          {otherDocs.length === 0 && !loading && (
            <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-10 text-center">
              <FileText size={22} className="text-[#D1CCCC] mx-auto mb-2" />
              <p className="text-[13px] text-[#737373]">No documents yet.</p>
              <p className="text-[12px] text-[#9E9E9E] mt-1">Ask AI to generate one above, or create manually.</p>
            </div>
          )}
          {otherDocs.map(doc => (
            <div key={doc.id} className="bg-white border border-[#E5E2DE] rounded-xl p-4 flex items-start justify-between gap-3 hover:shadow-sm transition-shadow">
              <button onClick={() => setViewing(doc)} className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[14px] font-semibold text-[#1A1A1A] truncate">{doc.title}</p>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[doc.doc_type] ?? 'bg-[#F7F5F2] text-[#737373]'}`}>
                    {TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                  </span>
                </div>
                <p className="text-[12px] text-[#737373] truncate">{doc.content.slice(0, 90)}{doc.content.length > 90 ? '…' : ''}</p>
                <p className="text-[11px] text-[#9E9E9E] mt-1">{timeAgo(doc.created_at)} · {doc.source}</p>
              </button>
              <button onClick={() => downloadDoc(doc)} title="Download .md"
                className="shrink-0 p-2 text-[#737373] hover:text-[#1A1A1A] hover:bg-[#F7F5F2] rounded-lg transition-colors">
                <Download size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Files list */}
      {tab === 'files' && (
        <div className="space-y-3">
          {files.length === 0 && !loading && (
            <div className="border-2 border-dashed border-[#E5E2DE] rounded-xl py-10 text-center">
              <Upload size={22} className="text-[#D1CCCC] mx-auto mb-2" />
              <p className="text-[13px] text-[#737373]">No files uploaded yet.</p>
              <p className="text-[12px] text-[#9E9E9E] mt-1">Upload PDFs, docs, images — Buddies reads them as project context.</p>
              <button onClick={() => fileInputRef.current?.click()}
                className="mt-3 px-4 py-2 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
                Upload File
              </button>
            </div>
          )}
          {files.map(f => (
            <div key={f.id} className="bg-white border border-[#E5E2DE] rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#F0EDE9] flex items-center justify-center shrink-0">
                <File size={16} className="text-[#737373]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#1A1A1A] truncate">{f.filename}</p>
                <p className="text-[11px] text-[#737373] mt-0.5">{f.file_type} · {formatBytes(f.file_size)} · {timeAgo(f.created_at)}</p>
                {f.summary && (
                  <p className="text-[12px] text-[#404040] mt-1.5 leading-relaxed line-clamp-2">{f.summary}</p>
                )}
                <p className="text-[10px] text-[#10B981] mt-1">✓ Readable by project assistant</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full doc viewer modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-[700px] max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E2DE]">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-[15px] font-semibold text-[#1A1A1A] truncate">{viewing.title}</h3>
                {viewing.is_living && <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#10B981]">Living</span>}
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => downloadDoc(viewing)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E5E2DE] text-[#737373] text-[12px] rounded-lg hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-colors">
                  <Download size={13} /> .md
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

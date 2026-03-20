"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Save, Loader2, CheckCircle2, BookOpen,
  Globe, Archive, FileText, Wand2, X
} from "lucide-react";

const STATUSES = ["draft", "published", "archived"] as const;
type Status = typeof STATUSES[number];

const STATUS_COLORS: Record<Status, string> = {
  draft: "#F59E0B", published: "#10B981", archived: "#737373",
};

export default function DocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // AI assist
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiPanel, setShowAiPanel] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/documents/${id}`).then(r => r.json()).catch(() => ({}));
    if (res.document) {
      setTitle(res.document.title);
      setContent(res.document.content ?? "");
      setStatus(res.document.status ?? "draft");
    } else {
      setError("Document not found.");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  // Auto-save after 2s of inactivity
  const triggerAutoSave = useCallback((newTitle: string, newContent: string, newStatus: Status) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDoc(newTitle, newContent, newStatus, true);
    }, 2000);
  }, []);

  async function saveDoc(t = title, c = content, s = status, silent = false) {
    if (!t.trim()) return;
    if (!silent) setSaving(true);
    const res = await fetch(`/api/documents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, content: c, status: s }),
    }).then(r => r.json()).catch(() => ({}));
    if (!silent) {
      setSaving(false);
      if (res.document) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    }
  }

  async function generateWithAI() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: `Write a document section for: ${aiPrompt}\n\nDocument title: "${title}"\n\nExisting content:\n${content}` }],
        model: "claude-sonnet-4-5",
      }),
    }).then(r => r.json()).catch(() => ({}));
    if (res.content) {
      const appended = content ? `${content}\n\n${res.content}` : res.content;
      setContent(appended);
      triggerAutoSave(title, appended, status);
    }
    setAiPrompt("");
    setAiLoading(false);
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-[#F7F5F2]">
      <Loader2 className="w-6 h-6 animate-spin text-[#B0ADA9]" />
    </div>
  );

  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#F7F5F2]">
      <FileText className="w-10 h-10 text-[#E5E2DE]" />
      <p className="text-sm text-[#737373]">{error}</p>
      <Link href="/app/documents" className="text-sm text-[#B5622A] hover:underline">← Back to Documents</Link>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F7F5F2]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-[#E5E2DE] shrink-0">
        <Link href="/app/documents" className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-[#1A1A1A] hover:bg-[#F0EDE9] transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <BookOpen className="w-4 h-4 text-[#B5622A] shrink-0" />
        <input
          value={title}
          onChange={e => {
            setTitle(e.target.value);
            triggerAutoSave(e.target.value, content, status);
          }}
          placeholder="Document title..."
          className="flex-1 text-[15px] font-semibold bg-transparent focus:outline-none text-[#1A1A1A] placeholder-[#B0ADA9] min-w-0"
        />

        {/* Status picker */}
        <div className="flex gap-1 bg-[#F0EDE9] p-0.5 rounded-lg shrink-0">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { setStatus(s); triggerAutoSave(title, content, s); }}
              className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md capitalize transition-colors ${
                status === s ? "bg-white shadow-sm text-[#1A1A1A]" : "text-[#737373] hover:text-[#1A1A1A]"
              }`}
            >
              {s === "published" && <Globe className="w-2.5 h-2.5" style={{ color: STATUS_COLORS[s] }} />}
              {s === "draft" && <FileText className="w-2.5 h-2.5" style={{ color: STATUS_COLORS[s] }} />}
              {s === "archived" && <Archive className="w-2.5 h-2.5" style={{ color: STATUS_COLORS[s] }} />}
              {s}
            </button>
          ))}
        </div>

        {/* AI assist toggle */}
        <button
          onClick={() => setShowAiPanel(v => !v)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
            showAiPanel ? "bg-[#B5622A] text-white" : "bg-[#F0EDE9] text-[#737373] hover:text-[#1A1A1A]"
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />AI Write
        </button>

        {/* Save button */}
        <button
          onClick={() => saveDoc()}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B5622A] hover:bg-[#9A4E20] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* AI assist panel */}
      {showAiPanel && (
        <div className="shrink-0 px-6 py-3 bg-[#FFF4EF] border-b border-[#FDDACB] flex gap-2 items-start">
          <Wand2 className="w-4 h-4 text-[#B5622A] mt-2 shrink-0" />
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generateWithAI(); } }}
            placeholder='Describe what to write, e.g. "Introduction paragraph about our design process"'
            rows={2}
            className="flex-1 text-sm px-3 py-2 bg-white border border-[#FDDACB] rounded-lg focus:outline-none focus:border-[#B5622A] resize-none"
          />
          <button
            onClick={generateWithAI}
            disabled={!aiPrompt.trim() || aiLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#B5622A] hover:bg-[#9A4E20] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate"}
          </button>
          <button onClick={() => setShowAiPanel(false)} className="p-1 text-[#B0ADA9] hover:text-[#737373] mt-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-[760px] mx-auto">
          <textarea
            value={content}
            onChange={e => {
              setContent(e.target.value);
              triggerAutoSave(title, e.target.value, status);
            }}
            placeholder="Start writing your document here…&#10;&#10;Use the AI Write button above to generate content with Buddies AI."
            className="w-full min-h-[calc(100vh-220px)] text-[14px] leading-7 text-[#1A1A1A] bg-white border border-[#E5E2DE] rounded-2xl p-6 focus:outline-none focus:border-[#B5622A] resize-none font-sans placeholder-[#B0ADA9]"
          />
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Send, Copy, RotateCcw, Trash2, Edit2,
  MessageSquare, Check, ChevronDown, Globe, Square, X
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import VoiceInputButton from "@/components/VoiceInputButton";
import FileUpload from "@/components/FileUpload";
import WebSearchButton from "@/components/WebSearchButton";
import ApprovalModal, { type PendingAction } from "@/components/ApprovalModal";

// ── Action-block helpers (global AI) ─────────────────────────────────────────
const AI_ACTION_OPEN = "[BUDDIES_ACTION]";
const AI_ACTION_CLOSE = "[/BUDDIES_ACTION]";

function parseGlobalActionBlock(text: string): PendingAction | null {
  const start = text.indexOf(AI_ACTION_OPEN);
  if (start === -1) return null;
  const afterOpen = text.slice(start + AI_ACTION_OPEN.length);
  const closeIdx = afterOpen.indexOf(AI_ACTION_CLOSE);
  const raw = (closeIdx === -1 ? afterOpen : afterOpen.slice(0, closeIdx)).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.type || !parsed?.params) return null;
    return { type: parsed.type, description: parsed.description ?? parsed.type, warning: parsed.warning ?? null, params: parsed.params };
  } catch { return null; }
}

function stripGlobalActionBlocks(text: string): string {
  let result = text;
  while (true) {
    const s = result.indexOf(AI_ACTION_OPEN);
    if (s === -1) break;
    const close = result.indexOf(AI_ACTION_CLOSE, s + AI_ACTION_OPEN.length);
    result = close === -1 ? result.slice(0, s) : result.slice(0, s) + result.slice(close + AI_ACTION_CLOSE.length);
  }
  return result.trim();
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;
  const k = () => keyIdx++;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      nodes.push(<CodeBlock key={k()} code={codeLines.join("\n")} lang={lang} />);
      i++; continue;
    }
    if (line.startsWith("# "))  { nodes.push(<h1 key={k()} className="text-xl font-bold text-[#C8C5C0] mt-6 mb-3 first:mt-0">{inlineRender(line.slice(2))}</h1>); i++; continue; }
    if (line.startsWith("## ")) { nodes.push(<h2 key={k()} className="text-lg font-bold text-[#C8C5C0] mt-5 mb-2 first:mt-0">{inlineRender(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith("### ")){ nodes.push(<h3 key={k()} className="text-base font-semibold text-[#C8C5C0] mt-4 mb-1.5 first:mt-0">{inlineRender(line.slice(4))}</h3>); i++; continue; }
    if (line.match(/^[-*]{3,}$/)) { nodes.push(<hr key={k()} className="border-[#2D2D2D] my-4" />); i++; continue; }
    if (line.startsWith("> ")) { nodes.push(<blockquote key={k()} className="border-l-4 border-[#B5622A] pl-4 my-3 text-[#737373] italic">{inlineRender(line.slice(2))}</blockquote>); i++; continue; }
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) { items.push(lines[i].slice(2)); i++; }
      nodes.push(<ul key={k()} className="list-none my-3 space-y-2 pl-1">{items.map((item, j) => (<li key={j} className="flex items-start gap-2.5 text-[15px] text-[#C8C5C0]"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#B5622A] shrink-0" /><span className="leading-relaxed">{inlineRender(item)}</span></li>))}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      nodes.push(<ol key={k()} className="list-none my-3 space-y-2 pl-1">{items.map((item, j) => (<li key={j} className="flex items-start gap-2.5 text-[15px] text-[#C8C5C0]"><span className="shrink-0 w-5 h-5 rounded-full bg-[#1E1E1E] text-[#B5622A] text-[11px] font-bold flex items-center justify-center">{j + 1}</span><span className="leading-relaxed">{inlineRender(item)}</span></li>))}</ol>);
      continue;
    }
    if (line.trim() === "") { nodes.push(<div key={k()} className="h-3" />); i++; continue; }
    nodes.push(<p key={k()} className="text-[15px] text-[#C8C5C0] leading-relaxed">{inlineRender(line)}</p>);
    i++;
  }
  return nodes;
}

function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.+?\]\(.+?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-[#C8C5C0]">{part.slice(2,-2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i} className="italic">{part.slice(1,-1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="font-mono text-[13px] bg-[#1E1E1E] text-[#B5622A] px-1.5 py-0.5 rounded">{part.slice(1,-1)}</code>;
    const lm = part.match(/\[(.+?)\]\((.+?)\)/);
    if (lm) return <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer" className="text-[#B5622A] underline hover:text-[#9A4E20]">{lm[1]}</a>;
    return part;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[#2D2D2D]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1A1A1A]">
        <span className="text-[11px] text-[#737373] font-mono uppercase tracking-wider">{lang || "code"}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1.5 text-[11px] text-[#525252] hover:text-white transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#2D2D2D] text-[#E5E2DE] text-[13px] font-mono p-5 overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

interface Message { role: "user" | "assistant"; content: string; ts?: string; webSearchUsed?: boolean; images?: string[]; }
interface Session { id: string; title: string; created_at: string; }
interface MessageGroup { role: "user" | "assistant"; messages: Message[]; }

function groupSessions(sessions: Session[]) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const groups: Record<string, Session[]> = { Today: [], Yesterday: [], "This Week": [], Older: [] };
  sessions.forEach(s => {
    const d = new Date(s.created_at);
    if (d.toDateString() === today) groups["Today"].push(s);
    else if (d.toDateString() === yesterday) groups["Yesterday"].push(s);
    else if (d >= weekAgo) groups["This Week"].push(s);
    else groups["Older"].push(s);
  });
  return groups;
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;
  messages.forEach(msg => {
    if (!current || current.role !== msg.role) { current = { role: msg.role, messages: [msg] }; groups.push(current); }
    else current.messages.push(msg);
  });
  return groups;
}

const SUGGESTIONS = [
  "What's active across my projects right now?",
  "What blockers or decisions are unresolved?",
  "What should I focus on next?",
  "Summarize what I've been working on this week.",
];

export default function AIPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"anthropic" | "openai" | "xai">("openai");
  const [selectedModel, setSelectedModel] = useState("gpt-4.1");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [sessionSummary, setSessionSummary] = useState("");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const MAX_CHARS = 12000;

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  useEffect(() => {
    supabase
      .from("projects")
      .select("id, name, status")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .then(({ data }) => setProjects(data ?? []));
  }, []);

  useEffect(() => {
    const p = localStorage.getItem("buddies-ai-provider");
    const m = localStorage.getItem("buddies-ai-model");
    if (p === "anthropic" || p === "openai" || p === "xai") setSelectedProvider(p);
    if (m) setSelectedModel(m);
  }, []);

  // Screenshot paste
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) setAttachedFiles(prev => [...prev, file]);
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  async function loadSessions() {
    const res = await fetch("/api/ai/sessions");
    if (!res.ok) return;
    const { sessions: data } = await res.json();
    setSessions((data ?? []).map((s: any) => ({ ...s, title: s.title || "New chat" })));
  }

  function startNewChat() {
    setActiveSession(null);
    setMessages([]);
    setInput("");
    setSessionSummary("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function openSession(s: Session) {
    setActiveSession(s);
    setMessages([]);
    setSessionSummary(localStorage.getItem(`buddies-summary-${s.id}`) ?? "");
    const res = await fetch(`/api/ai/sessions?id=${s.id}`);
    if (res.ok) {
      const { session } = await res.json();
      setMessages(Array.isArray(session?.messages) ? session.messages : []);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/ai/sessions?id=${id}`, { method: "DELETE" });
    if (activeSession?.id === id) startNewChat();
    await loadSessions();
  }

  function copyMessage(content: string, id: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function startEdit(msg: Message, idx: number) { setEditingId(`${idx}`); setEditText(msg.content); }
  function cancelEdit() { setEditingId(null); setEditText(""); }

  async function saveEdit(idx: number) {
    const updated = [...messages];
    updated[idx].content = editText;
    setMessages(updated);
    setEditingId(null);
    setEditText("");
    if (activeSession?.id) {
      await fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: activeSession.id, messages: updated }) });
    }
  }

  function stopResponse() { abortControllerRef.current?.abort(); abortControllerRef.current = null; setLoading(false); }

  function convertToFile() {
    const blob = new Blob([input], { type: "text/plain" });
    setAttachedFiles(prev => [...prev, new File([blob], `message-${Date.now()}.txt`, { type: "text/plain" })]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  async function regenerate() {
    if (messages.length < 2) return;
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    setMessages(messages.slice(0, -1));
    await send(lastUser.content);
  }

  async function send(overrideInput?: string) {
    const text = (overrideInput ?? input).trim();
    if ((!text && attachedFiles.length === 0) || loading) return;

    const imageUrls: string[] = [];
    const fileContextBlocks: string[] = [];

    if (attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const uploadRes = await fetch("/api/ai/upload", { method: "POST", body: formData });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            if (uploadData.url && file.type.startsWith("image/")) imageUrls.push(uploadData.url);
            if (uploadData.summary && !file.type.startsWith("image/")) {
              fileContextBlocks.push(uploadData.isZip
                ? `📦 ZIP: **${file.name}**\nKey files: ${(uploadData.keyFiles ?? []).slice(0,8).join(", ")}\nSummary: ${uploadData.summary}`
                : `📄 File: **${file.name}**\nSummary: ${uploadData.summary}`);
            }
          }
        } catch {}
      }
      setAttachedFiles([]);
    }

    const combinedText = [text, ...fileContextBlocks].filter(Boolean).join("\n\n");
    const requestMessage = combinedText || (imageUrls.length > 0 ? "Please analyze the attached image(s)." : "");

    const userMsg: Message = {
      role: "user",
      content: requestMessage,
      ts: new Date().toISOString(),
      images: imageUrls.length > 0 ? imageUrls : undefined,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: requestMessage,
          sessionId: activeSession?.id ?? null,
          history: messages.slice(-50).map(m => ({ role: m.role, content: m.content, images: m.images })),
          contextEnabled: true,
          images: imageUrls.length > 0 ? imageUrls : undefined,
          sessionSummary: sessionSummary || undefined,
          provider: selectedProvider,
          model: selectedModel,          selectedProjectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = "Something went wrong.";
        try {
          const p = await res.json();
          errMsg = p?.error || errMsg;
          // Enhance error message for quota errors
          if (typeof errMsg === 'string') {
            if (res.status === 503) {
              errMsg = `⚠️ Service temporarily unavailable: ${errMsg}`;
            } else if (errMsg.includes('usage limits') || errMsg.includes('quota')) {
              errMsg = `⚠️ API quota reached. ${errMsg}`;
            } else if (errMsg.includes('both') && errMsg.includes('unavailable')) {
              errMsg = `⚠️ ${errMsg}`;
            }
          }
        } catch {}
        throw new Error(errMsg);
      }

      const payload = await res.json();
      const rawText = payload?.response || payload?.reply || "";

      // Parse + strip any action block from the AI response
      const parsedAction = parseGlobalActionBlock(rawText);
      const displayText = parsedAction ? stripGlobalActionBlocks(rawText) : rawText;
      if (parsedAction) setPendingAction(parsedAction);

      const assistantMsg: Message = {
        role: "assistant",
        content: displayText || "No response returned.",
        ts: new Date().toISOString(),
        webSearchUsed: Boolean(payload?.webSearchUsed),
      };

      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      // Save session
      if (activeSession?.id) {
        await fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: activeSession.id, messages: finalMessages }) });
      } else {
        const title = text.slice(0, 50);
        const saveRes = await fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, messages: finalMessages }) });
        if (saveRes.ok) {
          const { sessionId } = await saveRes.json();
          if (sessionId) setActiveSession({ id: sessionId, title, created_at: new Date().toISOString() });
        }
      }
      await loadSessions();

      // Background compression every 10 messages
      if (finalMessages.length >= 10 && finalMessages.length % 10 === 0 && activeSession?.id) {
        const sid = activeSession.id;
        fetch("/api/ai/summarize-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: finalMessages, sessionId: sid }) })
          .then(r => r.json()).then(({ summary }) => {
            if (summary) { setSessionSummary(summary); localStorage.setItem(`buddies-summary-${sid}`, summary); }
          }).catch(() => {});
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setMessages(prev => [...prev, { role: "assistant", content: "_(Response stopped)_", ts: new Date().toISOString() }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Connection error: ${err?.message ?? "Try again."}`, ts: new Date().toISOString() }]);
      }
    }

    abortControllerRef.current = null;
    setLoading(false);
  }

  const grouped = groupSessions(sessions);
  const messageGroups = groupMessages(messages);

  return (
    <div className="flex flex-1 overflow-hidden bg-[#0D0D0D]">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Session sidebar */}
      <div className={`flex flex-col bg-[#1A1A1A] border-r border-[#1E1E1E] transition-all duration-200 shrink-0
        md:relative fixed left-0 top-0 h-full z-40
        ${sidebarOpen ? "w-[240px]" : "w-0 overflow-hidden"}`}>

        <div className="p-3 border-b border-[#1E1E1E]">
          <button onClick={startNewChat}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#B5622A] text-white text-[13px] font-semibold hover:bg-[#9A4E20] transition-colors">
            <Plus size={15} /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {Object.entries(grouped).map(([group, items]) => {
            if (!items.length) return null;
            return (
              <div key={group} className="mb-4">
                <div className="px-4 py-1.5 text-[10px] font-bold text-[#525252] uppercase tracking-widest">{group}</div>
                {items.map(s => (
                  <div key={s.id} onClick={() => openSession(s)}
                    className={`group relative mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                      ${activeSession?.id === s.id ? "bg-[#1E1E1E] text-white" : "text-[#737373] hover:bg-[#1A1A1A] hover:text-[#525252]"}`}>
                    <div className="flex items-start gap-2.5">
                      <MessageSquare size={13} className="shrink-0 mt-0.5 opacity-60" />
                      <span className="text-[12px] leading-snug line-clamp-2 flex-1">{s.title}</span>
                    </div>
                    <button onClick={e => deleteSession(s.id, e)}
                      className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 p-1 rounded transition-opacity">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {sessions.length === 0 && <div className="px-4 py-12 text-center text-[#525252] text-[11px]">No chats yet</div>}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header — clean */}
        <div className="flex items-center justify-between px-3 md:px-4 py-2 md:py-3 bg-[#1A1A1A] border-b border-[#2D2D2D] shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(v => !v)}
              className="flex flex-col justify-center items-center w-7 h-7 md:w-8 md:h-8 gap-1.5 text-[#737373] hover:text-[#C8C5C0] rounded-lg hover:bg-[#1E1E1E] transition-colors shrink-0">
              <span className="w-3.5 h-0.5 bg-current rounded-full" />
              <span className="w-3.5 h-0.5 bg-current rounded-full" />
              <span className="w-3.5 h-0.5 bg-current rounded-full" />
            </button>
            <span className="text-[13px] md:text-[15px] font-semibold text-[#C8C5C0] truncate min-w-0">
              {activeSession?.title ?? "Buddies AI"}
            </span>
          </div>

          {/* Model selector */}
          <div className="relative shrink-0">
            <button onClick={() => setModelOpen(!modelOpen)}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-full bg-[#1E1E1E] border border-[#2D2D2D] text-white text-[10px] md:text-[11px] font-medium hover:bg-[#2D2D2D] transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
              <span className="hidden sm:inline capitalize">{selectedProvider} · </span>
              <span className="truncate max-w-[80px] md:max-w-[120px]">{selectedModel.replace('claude-','').replace('gpt-','').replace('grok-','')}</span>
              <ChevronDown size={10} />
            </button>

            {modelOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-4 py-2.5 border-b border-[#2D2D2D] bg-[#111111]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#737373] mb-2">Provider</p>
                  <div className="flex gap-2">
                    {[{ id: "anthropic", label: "Claude" }, { id: "openai", label: "OpenAI" }, { id: "xai", label: "Grok" }].map(p => (
                      <button key={p.id} onClick={() => {
                        setSelectedProvider(p.id as any);
                        localStorage.setItem("buddies-ai-provider", p.id);
                        const next = p.id === "anthropic" ? "claude-sonnet-4-5" : p.id === "openai" ? "gpt-4.1" : "grok-3";
                        setSelectedModel(next);
                        localStorage.setItem("buddies-ai-model", next);
                      }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors
                        ${selectedProvider === p.id ? "bg-[#1A1A1A] text-white" : "bg-[#1E1E1E] text-[#A8A5A0] hover:bg-[#2D2D2D]"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="py-1">
                  {(selectedProvider === "anthropic"
                    ? [{ value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" }, { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }]
                    : selectedProvider === "openai"
                    ? [
                        { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
                        { value: "gpt-4.1", label: "GPT-4.1" },
                        { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
                      ]
                    : [{ value: "grok-3-mini", label: "Grok 3 Mini" }, { value: "grok-3", label: "Grok 3" }]
                  ).map(m => (
                    <button key={m.value} onClick={() => { setSelectedModel(m.value); localStorage.setItem("buddies-ai-model", m.value); setModelOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors
                        ${selectedModel === m.value ? "bg-[#1E1E1E] text-[#B5622A] font-medium" : "text-[#C8C5C0] hover:bg-[#111111]"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-[760px] mx-auto">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-16">
                <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] flex items-center justify-center text-xl mb-5">🧠</div>
                <h2 className="text-[22px] font-bold text-[#C8C5C0] mb-2">Buddies AI</h2>
                <p className="text-[14px] text-[#737373] mb-10 max-w-[420px] leading-relaxed">
                  Your personal AI. Knows your projects, tracks patterns, remembers context across sessions.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-[600px]">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left text-[13px] text-[#737373] bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl px-4 py-4 hover:border-[#B5622A] hover:text-[#C8C5C0] hover:shadow-sm transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message groups */}
            {messageGroups.map((group, gIdx) => (
              <div key={gIdx} className="mb-8">
                <div className="flex gap-4 items-start">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                    ${group.role === "assistant" ? "bg-[#1A1A1A] text-[15px]" : "bg-[#B5622A] text-white text-[12px] font-bold"}`}>
                    {group.role === "assistant" ? "🤖" : "S"}
                  </div>
                  <div className="flex-1 space-y-4">
                    {group.messages.map((msg, mIdx) => {
                      const globalIdx = messages.findIndex(m => m === msg);
                      const msgId = `${gIdx}-${mIdx}`;
                      const isEditing = editingId === `${globalIdx}`;
                      return (
                        <div key={mIdx} onMouseEnter={() => setHoveredId(msgId)} onMouseLeave={() => setHoveredId(null)} className="group">
                          {isEditing ? (
                            <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
                              <textarea value={editText} onChange={e => setEditText(e.target.value)}
                                className="w-full bg-transparent text-[15px] text-[#C8C5C0] resize-none focus:outline-none leading-relaxed min-h-[80px]" />
                              <div className="flex gap-2 mt-3">
                                <button onClick={() => saveEdit(globalIdx)} className="px-3 py-1.5 rounded-lg bg-[#B5622A] text-white text-[12px] font-medium hover:bg-[#9A4E20]">Save</button>
                                <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg bg-[#1E1E1E] text-[#C8C5C0] text-[12px] font-medium hover:bg-[#2D2D2D]">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`rounded-2xl px-5 py-4 ${group.role === "assistant" ? "bg-[#1A1A1A] border border-[#2D2D2D]" : "bg-[#1E1E1E]"}`}>
                                {group.role === "user" ? (
                                  <div>
                                    <p className="text-[15px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    {msg.images && msg.images.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {msg.images.map((url, ii) => (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img key={ii} src={url} alt="attachment" className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-[#2D2D2D]" />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="prose-sm">
                                    {renderMarkdown(msg.content)}
                                    {msg.webSearchUsed && (
                                      <div className="mt-3 pt-2.5 border-t border-[#2D2D2D]">
                                        <span className="flex items-center gap-1 text-[10px] font-medium text-[#3B82F6]">
                                          <Globe size={10} /> Web searched
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className={`flex items-center gap-3 mt-2 transition-opacity ${hoveredId === msgId ? "opacity-100" : "opacity-0"}`}>
                                {msg.ts && <span className="text-[11px] text-[#525252]">{new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                                <button onClick={() => copyMessage(msg.content, msgId)}
                                  className="flex items-center gap-1 text-[11px] text-[#525252] hover:text-[#C8C5C0] transition-colors">
                                  {copiedId === msgId ? <Check size={12} /> : <Copy size={12} />}
                                  {copiedId === msgId ? "Copied" : "Copy"}
                                </button>
                                {group.role === "user" && (
                                  <button onClick={() => startEdit(msg, globalIdx)}
                                    className="flex items-center gap-1 text-[11px] text-[#525252] hover:text-[#C8C5C0] transition-colors">
                                    <Edit2 size={12} /> Edit
                                  </button>
                                )}
                                {group.role === "assistant" && mIdx === group.messages.length - 1 && gIdx === messageGroups.length - 1 && (
                                  <button onClick={regenerate} disabled={loading}
                                    className="flex items-center gap-1 text-[11px] text-[#525252] hover:text-[#C8C5C0] transition-colors disabled:opacity-40">
                                    <RotateCcw size={12} /> Regenerate
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="flex gap-4 items-start mb-8">
                <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center text-[15px] shrink-0">🤖</div>
                <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl px-5 py-4">
                  <div className="flex gap-1.5 items-center h-6">
                    {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#B0ADA9] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-4 py-4 bg-[#1A1A1A] border-t border-[#2D2D2D] shrink-0" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="max-w-[760px] mx-auto">

            {/* Large text warning */}
            {input.length > MAX_CHARS && (
              <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[12px]">
                <span className="text-amber-700">⚠️ Message is <strong>{input.length.toLocaleString()}</strong> chars — convert to a file?</span>
                <button onClick={convertToFile} className="shrink-0 px-3 py-1 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors">Convert to .txt</button>
              </div>
            )}

            {/* Attached files */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachedFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#1E1E1E] rounded-lg text-[12px] text-[#737373]">
                    {file.type.startsWith("image/") ? "🖼️" : file.name.endsWith(".zip") ? "📦" : "📄"}
                    {file.name.slice(0, 20)}{file.name.length > 20 ? "…" : ""}
                    <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} className="ml-0.5 hover:text-[#B5622A] transition-colors">✕</button>
                  </div>
                ))}
              </div>
            )}
            {/* Project context selector */}
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              {selectedProjectIds.map(id => {
                const p = projects.find(x => x.id === id);
                if (!p) return null;
                return (
                  <div key={id} className="flex items-center gap-1 px-2.5 py-1 bg-[#B5622A15] border border-[#B5622A30] rounded-full text-[11px] font-medium text-[#B5622A]">
                    <span>📁</span>{p.name}
                    <button onClick={() => setSelectedProjectIds(prev => prev.filter(x => x !== id))} className="ml-0.5 hover:text-red-500 transition-colors">✕</button>
                  </div>
                );
              })}
              <div className="relative">
                <button onClick={() => setShowProjectPicker(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#2D2D2D] text-[11px] text-[#737373] hover:border-[#B5622A] hover:text-[#C8C5C0] transition-colors bg-[#1A1A1A]">
                  📁 {selectedProjectIds.length === 0 ? "Add project context" : `+${projects.length - selectedProjectIds.length} more`}
                </button>
                {showProjectPicker && (
                  <div className="absolute bottom-full mb-1 left-0 w-[200px] bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="p-2">
                      <p className="text-[10px] font-bold text-[#737373] uppercase tracking-widest px-2 mb-1.5">Project context</p>
                      <button onClick={() => { setSelectedProjectIds([]); setShowProjectPicker(false); }}
                        className="w-full text-left px-2 py-1.5 text-[11px] text-[#737373] hover:bg-[#111111] rounded-lg transition-colors mb-1">
                        ✕ Clear all (general chat)
                      </button>
                      {projects.map(p => (
                        <button key={p.id} onClick={() => setSelectedProjectIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#111111] transition-colors">
                          <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${selectedProjectIds.includes(p.id) ? "bg-[#B5622A] border-[#B5622A]" : "border-[#2D2D2D]"}`}>
                            {selectedProjectIds.includes(p.id) && <span className="text-white text-[8px] font-bold">✓</span>}
                          </div>
                          <span className="text-[11px] text-[#C8C5C0] truncate">{p.name}</span>
                        </button>
                      ))}
                      <button onClick={() => setShowProjectPicker(false)} className="w-full mt-1 py-1 text-[11px] text-[#737373] border-t border-[#2D2D2D] transition-colors hover:text-[#C8C5C0]">Done</button>
                    </div>
                  </div>
                )}
              </div>
            </div>            <div className="bg-[#111111] rounded-2xl px-4 py-3 border border-[#2D2D2D] focus-within:border-[#B5622A] transition-colors">
              <div className="flex items-center gap-2 pb-2">
                <VoiceInputButton onTranscript={t => { setInput(t); setTimeout(() => textareaRef.current?.focus(), 0); }} />
                <FileUpload onFilesSelected={f => setAttachedFiles(prev => [...prev, ...f])} />
                <WebSearchButton onSearch={q => { setInput(q); setTimeout(() => textareaRef.current?.focus(), 0); }} />
              </div>
              <div className="flex items-end gap-2">
                <textarea ref={textareaRef} value={input} onChange={autoResize} onKeyDown={handleKey}
                  placeholder="Ask anything, mention a project by name for deep context..."
                  rows={2}
                  className="flex-1 bg-transparent text-[15px] text-[#C8C5C0] placeholder:text-[#525252] resize-none focus:outline-none leading-relaxed"
                  style={{ maxHeight: "180px", minHeight: "52px" }} />
                {input.length > 8000 && (
                  <span className={`text-[10px] font-mono shrink-0 self-end mb-1 ${input.length > MAX_CHARS ? "text-red-500" : "text-amber-500"}`}>
                    {input.length.toLocaleString()}/{MAX_CHARS.toLocaleString()}
                  </span>
                )}
                {loading ? (
                  <button onClick={stopResponse} title="Stop"
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#1A1A1A] text-white hover:bg-[#B5622A] transition-all">
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={() => send()} disabled={!input.trim() && attachedFiles.length === 0}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:bg-[#2D2D2D] disabled:text-[#525252] bg-[#B5622A] text-white hover:bg-[#9A4E20]">
                    <Send size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action approval modal — shown when AI proposes a write action */}
      {pendingAction && (
        <ApprovalModal
          action={pendingAction}
          onApprove={async () => {
            const res = await fetch("/api/ai/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: pendingAction.type, params: pendingAction.params }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success) throw new Error(data?.error || "Action failed");
            const confirmMsg: Message = {
              role: "assistant",
              content: `${data.result || "✅ Done."}\n\nHow would you like to proceed?`,
              ts: new Date().toISOString(),
            };
            setMessages(prev => [...prev, confirmMsg]);
            setPendingAction(null);
          }}
          onDeny={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

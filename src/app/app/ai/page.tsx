"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Send, Copy, RotateCcw, Trash2, Edit2,
  MessageSquare, Check, ChevronDown, Globe, Paperclip, Square, X, Code2, ExternalLink, RefreshCw
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ContextPreviewModal from "@/components/ContextPreviewModal";
import ContextToggle from "@/components/ContextToggle";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import { savePendingCommand } from "@/lib/offline-store";
import QuickActionsDropdown from "@/components/QuickActionsDropdown";
import VoiceInputButton from "@/components/VoiceInputButton";
import SearchModal from "@/components/SearchModal";
import WebSearchButton from "@/components/WebSearchButton";
import FileUpload from "@/components/FileUpload";
import ApprovalModal, { PendingAction } from "@/components/ApprovalModal";
import DocumentCard from "@/components/DocumentCard";

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
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join("\n");
      nodes.push(<CodeBlock key={k()} code={code} lang={lang} />);
      i++;
      continue;
    }

    if (line.startsWith("# ")) {
      nodes.push(<h1 key={k()} className="text-xl font-bold text-[#1A1A1A] mt-6 mb-3 first:mt-0">{inlineRender(line.slice(2))}</h1>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={k()} className="text-lg font-bold text-[#1A1A1A] mt-5 mb-2 first:mt-0">{inlineRender(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={k()} className="text-base font-semibold text-[#1A1A1A] mt-4 mb-1.5 first:mt-0">{inlineRender(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.match(/^[-*]{3,}$/)) {
      nodes.push(<hr key={k()} className="border-[#E5E2DE] my-4" />);
      i++; continue;
    }
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={k()} className="border-l-4 border-[#E8521A] pl-4 my-3 text-[#737373] italic">
          {inlineRender(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={k()} className="list-none my-3 space-y-2 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 text-[15px] text-[#1A1A1A]">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#E8521A] shrink-0" />
              <span className="leading-relaxed">{inlineRender(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      nodes.push(
        <ol key={k()} className="list-none my-3 space-y-2 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 text-[15px] text-[#1A1A1A]">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#F0EDE9] text-[#E8521A] text-[11px] font-bold flex items-center justify-center">{j + 1}</span>
              <span className="leading-relaxed">{inlineRender(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }
    if (line.trim() === "") {
      nodes.push(<div key={k()} className="h-3" />);
      i++; continue;
    }
    nodes.push(
      <p key={k()} className="text-[15px] text-[#1A1A1A] leading-relaxed">
        {inlineRender(line)}
      </p>
    );
    i++;
  }
  return nodes;
}

function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.+?\]\(.+?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-[#1A1A1A]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-[13px] bg-[#F0EDE9] text-[#E8521A] px-1.5 py-0.5 rounded">{part.slice(1, -1)}</code>;
    const linkMatch = part.match(/\[(.+?)\]\((.+?)\)/);
    if (linkMatch)
      return <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-[#E8521A] underline hover:text-[#c94415]">{linkMatch[1]}</a>;
    return part;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[#2D2D2D] shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1A1A1A]">
        <span className="text-[11px] text-[#737373] font-mono uppercase tracking-wider">{lang || "code"}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-[#B0ADA9] hover:text-white transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#2D2D2D] text-[#E5E2DE] text-[13px] font-mono p-5 overflow-x-auto leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

interface Message { role: "user" | "assistant"; content: string; ts?: string; contextUsed?: boolean; isCommand?: boolean; webSearchUsed?: boolean; images?: string[]; document?: { title: string; content: string }; }
interface Session { id: string; title: string; created_at: string; messages?: Message[]; }

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

interface MessageGroup { role: "user" | "assistant"; messages: Message[]; }

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;
  messages.forEach(msg => {
    if (!current || current.role !== msg.role) {
      current = { role: msg.role, messages: [msg] };
      groups.push(current);
    } else {
      current.messages.push(msg);
    }
  });
  return groups;
}

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
  const [selectedModel, setSelectedModel] = useState("Claude 3.5 Sonnet");
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sessionSummary, setSessionSummary] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [contextNoteOpen, setContextNoteOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: PendingAction; msgIdx: number } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeUrl, setCodeUrl] = useState<string>('https://vscode.dev');
  const [codeBlocked, setCodeBlocked] = useState(false);
  const [codeRetryKey, setCodeRetryKey] = useState(0);

  /** Strip [BUDDIES_ACTION]…[/BUDDIES_ACTION] from text and return {clean, action} */
  function parseActionBlock(text: string): { clean: string; action: PendingAction | null } {
    const match = text.match(/\[BUDDIES_ACTION\]([\s\S]*?)\[\/BUDDIES_ACTION\]/);
    if (!match) return { clean: text, action: null };
    try {
      const action = JSON.parse(match[1].trim()) as PendingAction;
      const clean = text.replace(match[0], "").trim();
      return { clean, action };
    } catch {
      return { clean: text, action: null };
    }
  }

  async function executeAction(action: PendingAction, msgIdx: number) {
    const r = await fetch("/api/ai/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: action.type, params: action.params }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? `Execution failed (${r.status})`);
    // Append result as assistant message
    const resultMsg: Message = {
      role: "assistant",
      content: data.result ?? "✅ Action completed.",
      ts: new Date().toISOString(),
      isCommand: true,
      // Carry document payload if returned (generate_document action)
      document: data.document ?? undefined,
    };
    setMessages(prev => {
      const updated = [...prev, resultMsg];
      if (activeSession?.id) {
        fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSession.id, messages: updated }),
        }).catch(() => {});
      }
      return updated;
    });
    setPendingAction(null);
  }

  function stopResponse() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  }

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Fetch GitHub integration for the code panel URL
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('integrations')
        .select('config')
        .eq('user_id', user.id)
        .eq('type', 'github')
        .eq('status', 'active')
        .limit(1)
        .single();
      if (data?.config?.repo_url) {
        const repo = (data.config.repo_url as string)
          .replace(/^https?:\/\/github\.com\//, '')
          .replace(/\.git$/, '')
          .replace(/\/$/, '');
        setCodeUrl(`https://github.dev/${repo}`);
      } else if (data?.config?.org_or_user) {
        setCodeUrl(`https://github.dev/${data.config.org_or_user}`);
      }
    })();
  }, []);

  // When code panel opens, start timer to detect X-Frame-Options block
  useEffect(() => {
    if (!codeOpen) return;
    setCodeBlocked(false);
    const timer = setTimeout(() => setCodeBlocked(true), 4000);
    return () => clearTimeout(timer);
  }, [codeOpen, codeRetryKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Screenshot paste handler
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            setAttachedFiles(prev => [...prev, file]);
          }
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
    setSessions((data ?? []).map((s: any) => ({
      ...s,
      title: s.title || "New chat",
      messages: []
    })));
  }

  function startNewChat() {
    setActiveSession(null);
    setMessages([]);
    setInput("");
    setSessionSummary("");
    setContextNote("");
    textareaRef.current?.focus();
  }

  async function openSession(s: Session) {
    setActiveSession(s);
    setMessages([]);
    setSessionSummary(localStorage.getItem(`buddies-summary-${s.id}`) ?? "");
    setContextNote(localStorage.getItem(`buddies-note-${s.id}`) ?? "");
    const res = await fetch(`/api/ai/sessions?id=${s.id}`);
    if (res.ok) {
      const { session } = await res.json();
      const msgs = Array.isArray(session?.messages) ? session.messages : [];
      setMessages(msgs);
      setActiveSession({ ...s, messages: msgs });
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

  function startEdit(msg: Message, idx: number) {
    setEditingId(`${idx}`);
    setEditText(msg.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function saveContextNote(note: string) {
    setContextNote(note);
    if (activeSession?.id) {
      localStorage.setItem(`buddies-note-${activeSession.id}`, note);
    }
  }

  async function saveEdit(idx: number) {
    const updated = [...messages];
    updated[idx].content = editText;
    setMessages(updated);
    setEditingId(null);
    setEditText("");
    if (activeSession?.id) {
      await fetch("/api/ai/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSession.id, messages: updated })
      });
    }
  }

  function handleQuickAction(command: string) {
    setInput(command);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleVoiceTranscript(transcript: string) {
    setInput(transcript);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function send(overrideInput?: string) {
    const text = (overrideInput ?? input).trim();
    if ((!text && attachedFiles.length === 0) || loading) return;

    // Upload any attached files first
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
            if (uploadData.url) imageUrls.push(uploadData.url);
            // For ZIP and non-image files, inject the extracted summary into the message
            if (uploadData.summary && !file.type.startsWith("image/")) {
              const block = uploadData.isZip
                ? `📦 ZIP: **${file.name}** (${uploadData.fileCount ?? "?"} files)\nKey files: ${(uploadData.keyFiles ?? []).slice(0, 8).join(", ")}\nSummary: ${uploadData.summary}`
                : `📄 File: **${file.name}**\nSummary: ${uploadData.summary}`;
              fileContextBlocks.push(block);
            }
          }
        } catch { /* skip failed uploads */ }
      }
      setAttachedFiles([]);
    }

    // Merge file context into the message text so Claude sees it
    const combinedText = [text, ...fileContextBlocks].filter(Boolean).join("\n\n");

    const userMsg: Message = {
      role: "user",
      content: combinedText || `📎 ${attachedFiles.length} file${attachedFiles.length > 1 ? "s" : ""} attached`,
      ts: new Date().toISOString(),
      images: imageUrls.length > 0 ? imageUrls : undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // ── Offline guard ─────────────────────────────────────────────
    if (!navigator.onLine) {
      await savePendingCommand({ type: "message", content: text });
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: "📡 You're offline. This message will be sent when you're back online.",
          ts: new Date().toISOString(),
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      // ── Check if it's a quick command first ───────────────────
      const cmdRes = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: combinedText }),
        signal,
      });
      const cmdData = await cmdRes.json();

      if (cmdData.isCommand) {
        const cmdMsg: Message = {
          role: "assistant",
          content: cmdData.response ?? "Done.",
          ts: new Date().toISOString(),
          isCommand: true,
        };
        const finalMessages = [...newMessages, cmdMsg];
        setMessages(finalMessages);
        if (activeSession?.id) {
          await fetch("/api/ai/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: activeSession.id, messages: finalMessages }),
          });
        }
        setLoading(false);
        return;
      }

      // ── Tier 2: AI natural language command extraction ─────────
      const extractRes = await fetch("/api/ai/extract-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: combinedText }),
        signal,
      });
      const extractData = await extractRes.json();

      if (extractData.isCommand && extractData.type) {
        const executeRes = await fetch("/api/ai/execute-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: extractData.type, data: extractData.data }),
          signal,
        });
        const executeData = await executeRes.json();

        if (executeData.success) {
          const nlCmdMsg: Message = {
            role: "assistant",
            content: executeData.response,
            ts: new Date().toISOString(),
            isCommand: true,
          };
          const finalMessages = [...newMessages, nlCmdMsg];
          setMessages(finalMessages);
          if (activeSession?.id) {
            await fetch("/api/ai/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: activeSession.id, messages: finalMessages }),
            });
          }
          setLoading(false);
          return;
        }
      }

      // ── Tier 3: Normal AI conversation ──────────────────────────
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: combinedText,
          sessionId: activeSession?.id ?? null,
          history: messages.slice(-50).map(m => ({
            role: m.role,
            content: m.content,
            images: m.images,
          })),
          contextEnabled,
          images: imageUrls.length > 0 ? imageUrls : undefined,
          sessionSummary: sessionSummary || undefined,
          contextNote: contextNote || undefined,
        }),
        signal,
      });
      const data = await res.json();
      const rawContent = data.response ?? data.error ?? "Something went wrong.";
      const { clean, action } = parseActionBlock(rawContent);
      const assistantMsg: Message = {
        role: "assistant",
        content: clean,
        ts: new Date().toISOString(),
        contextUsed: data.contextUsed,
        webSearchUsed: data.webSearchUsed,
      };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);
      // If AI proposed an action, queue the approval modal
      if (action) {
        setPendingAction({ action, msgIdx: finalMessages.length - 1 });
      }

      if (activeSession?.id) {
        await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSession.id, messages: finalMessages })
        });
      } else {
        const title = text.slice(0, 50);
        const saveRes = await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, messages: finalMessages })
        });
        if (saveRes.ok) {
          const { sessionId } = await saveRes.json();
          if (sessionId) setActiveSession({ id: sessionId, title, created_at: new Date().toISOString() });
        }
      }
      await loadSessions();

      // Background: summarize every 10 messages so context is retained beyond the 30-message window
      if (finalMessages.length >= 10 && finalMessages.length % 10 === 0 && activeSession?.id) {
        const idForSummary = activeSession.id;
        fetch("/api/ai/summarize-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalMessages }),
        }).then(r => r.json()).then(({ summary }) => {
          if (summary) {
            setSessionSummary(summary);
            localStorage.setItem(`buddies-summary-${idForSummary}`, summary);
          }
        }).catch(() => {});
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === "AbortError") {
        // Keep the user message visible but add a stopped marker so the
        // messages array stays alternating (user → assistant → user…).
        // Without this, the next send would have two consecutive user messages
        // which breaks Claude's conversation context.
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: "_(Response stopped)_", ts: new Date().toISOString() },
        ]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again.", ts: new Date().toISOString() }]);
      }
    }
    abortControllerRef.current = null;
    setLoading(false);
  }

  async function regenerate() {
    if (messages.length < 2) return;
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    const trimmed = messages.slice(0, -1);
    setMessages(trimmed);
    await send(lastUser.content);
  }

  const MAX_CHARS = 12000;

  function convertToFile() {
    const blob = new Blob([input], { type: "text/plain" });
    const file = new File([blob], `message-${Date.now()}.txt`, { type: "text/plain" });
    setAttachedFiles(prev => [...prev, file]);
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
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  const grouped = groupSessions(sessions);
  const messageGroups = groupMessages(messages);

  return (
    <>
    {pendingAction && (
      <ApprovalModal
        action={pendingAction.action}
        onApprove={() => executeAction(pendingAction.action, pendingAction.msgIdx)}
        onDeny={() => setPendingAction(null)}
      />
    )}
    <div className="flex flex-1 overflow-hidden bg-[#FAFAF8]">

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`flex flex-col bg-[#0F0F0F] border-r border-[#1E1E1E] transition-all duration-200 shrink-0
        md:relative fixed left-0 top-0 h-full z-40
        ${sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden"}`}>

        <div className="p-3 border-b border-[#1E1E1E]">
          <button onClick={startNewChat}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#E8521A] text-white text-[13px] font-semibold hover:bg-[#c94415] transition-colors">
            <Plus size={16} /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {Object.entries(grouped).map(([group, items]) => {
            if (!items.length) return null;
            return (
              <div key={group} className="mb-4">
                <div className="px-4 py-1.5 text-[10px] font-bold text-[#3A3A3A] uppercase tracking-widest">{group}</div>
                {items.map(s => (
                  <div key={s.id}
                    onClick={() => openSession(s)}
                    className={`group relative mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                      ${activeSession?.id === s.id ? "bg-[#1E1E1E] text-white" : "text-[#737373] hover:bg-[#1A1A1A] hover:text-[#B0ADA9]"}`}>
                    <div className="flex items-start gap-2.5">
                      <MessageSquare size={14} className="shrink-0 mt-0.5 opacity-60" />
                      <span className="text-[12px] leading-snug line-clamp-2 flex-1">{s.title}</span>
                    </div>
                    <button
                      onClick={e => deleteSession(s.id, e)}
                      className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#525252] hover:text-red-400 p-1 rounded">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {sessions.length === 0 && (
            <div className="px-4 py-12 text-center text-[#3A3A3A] text-[11px]">No chats yet</div>
          )}
        </div>

        {/* Suggestions Panel */}
        <div className="border-t border-[#1E1E1E] p-3">
          <SuggestionsPanel />
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-[#E5E2DE] shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)}
            className="flex flex-col justify-center items-center w-9 h-9 gap-1.5 text-[#737373] hover:text-[#1A1A1A] transition-colors rounded-lg hover:bg-[#F0EDE9]"
            title={sidebarOpen ? "Hide" : "Show"}>
            <span className="w-4 h-0.5 bg-current rounded-full" />
            <span className="w-4 h-0.5 bg-current rounded-full" />
            <span className="w-4 h-0.5 bg-current rounded-full" />
          </button>
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-[#1A1A1A]">
              {activeSession?.title ?? "New Chat"}
            </div>
          </div>
          {/* Context Toggle */}
          <ContextToggle onChange={setContextEnabled} />

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A] text-[11px] font-medium transition-colors"
            title="Search (⌘K)">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <span>Search</span>
            <kbd className="hidden sm:inline px-1 py-0.5 bg-white border border-[#E5E2DE] rounded text-[9px]">⌘K</kbd>
          </button>

          {/* Context badge */}
          <button onClick={() => setContextModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A] text-[11px] font-medium transition-colors">
            <span>🧠</span>
            <span>Context</span>
          </button>

          <button onClick={() => setContextNoteOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              contextNoteOpen || contextNote
                ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                : "bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A]"
            }`}>
            <span>📌</span>
            <span className="hidden sm:inline">Notes</span>
            {contextNote && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
          </button>

          <div className="relative">
            <button onClick={() => setModelOpen(!modelOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0F0F0F] text-white text-[11px] font-medium hover:bg-[#1A1A1A] transition-colors">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              {selectedModel}
              <ChevronDown size={12} />
            </button>
            {modelOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-[#E5E2DE] rounded-xl shadow-lg overflow-hidden z-50">
                {["Claude 3.5 Sonnet", "GPT-4", "GPT-3.5 Turbo"].map(m => (
                  <button key={m} onClick={() => { setSelectedModel(m); setModelOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors
                      ${selectedModel === m ? "bg-[#F0EDE9] text-[#E8521A] font-medium" : "text-[#1A1A1A] hover:bg-[#F7F5F2]"}`}>
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Code split panel toggle */}
          <button
            onClick={() => setCodeOpen(v => !v)}
            title={codeOpen ? "Close code panel" : "Open VS Code"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
              codeOpen
                ? "bg-[#0F0F0F] text-white hover:bg-[#1A1A1A]"
                : "bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A]"
            }`}>
            <Code2 size={13} />
            <span className="hidden sm:inline">Code</span>
          </button>
        </div>

        {/* Content: messages + optional code panel side-by-side */}
        <div className="flex flex-1 overflow-hidden">

        {/* Chat messages column */}
        <div className={`flex flex-col overflow-hidden transition-all duration-200 ${codeOpen ? 'w-[55%]' : 'flex-1'}`}>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-[800px] mx-auto">

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E8521A] to-[#c94415] flex items-center justify-center mb-5 shadow-lg">
                  <span className="text-2xl">🤖</span>
                </div>
                <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Buddies AI</h2>
                <p className="text-[15px] text-[#737373] mb-10">Ask anything. Get structured, actionable answers.</p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-[560px]">
                  {[
                    "What's the team working on today?",
                    "Summarize my active projects",
                    "What decisions have I made this week?",
                    "Give me a focus recommendation",
                  ].map(q => (
                    <button key={q} onClick={() => { setInput(q); send(q); }}
                      className="text-left text-[13px] text-[#737373] bg-white border border-[#E5E2DE] rounded-xl px-4 py-4 hover:border-[#E8521A] hover:text-[#1A1A1A] hover:shadow-sm transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messageGroups.map((group, gIdx) => (
              <div key={gIdx} className="mb-8">
                <div className="flex gap-4 items-start">
                  {group.role === "assistant" ? (
                    <div className="w-8 h-8 rounded-full bg-[#0F0F0F] flex items-center justify-center text-[15px] shrink-0">🤖</div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-[12px] font-bold shrink-0">S</div>
                  )}

                  <div className="flex-1 space-y-4">
                    {group.messages.map((msg, mIdx) => {
                      const globalIdx = messages.findIndex(m => m === msg);
                      const msgId = `${gIdx}-${mIdx}`;
                      const isEditing = editingId === `${globalIdx}`;

                      return (
                        <div key={mIdx}
                          onMouseEnter={() => setHoveredId(msgId)}
                          onMouseLeave={() => setHoveredId(null)}
                          className="group">

                          {isEditing ? (
                            <div className="bg-white border border-[#E5E2DE] rounded-xl p-4">
                              <textarea
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="w-full bg-transparent text-[15px] text-[#1A1A1A] resize-none focus:outline-none leading-relaxed min-h-[80px]"
                              />
                              <div className="flex gap-2 mt-3">
                                <button onClick={() => saveEdit(globalIdx)}
                                  className="px-3 py-1.5 rounded-lg bg-[#E8521A] text-white text-[12px] font-medium hover:bg-[#c94415]">
                                  Save
                                </button>
                                <button onClick={cancelEdit}
                                  className="px-3 py-1.5 rounded-lg bg-[#F0EDE9] text-[#1A1A1A] text-[12px] font-medium hover:bg-[#E5E2DE]">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`rounded-2xl px-5 py-4 ${
                                group.role === "assistant"
                                  ? msg.isCommand
                                    ? "bg-[#F0FDF4] border border-[#BBF7D0]"
                                    : "bg-white border border-[#E5E2DE]"
                                  : "bg-[#F0EDE9]"
                              }`}>
                                {group.role === "user" ? (
                                  <div>
                                    <p className="text-[15px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                    {msg.images && msg.images.length > 0 && (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {msg.images.map((url, ii) => (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img key={ii} src={url} alt="attachment"
                                            className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-[#E5E2DE]" />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="prose-sm">{renderMarkdown(msg.content)}</div>
                                )}
                                {/* Document card — shown when AI generated a document */}
                                {msg.document && (
                                  <DocumentCard title={msg.document.title} content={msg.document.content} />
                                )}
                                {group.role === "assistant" && msg.contextUsed !== undefined && (
                                  <div className="mt-3 pt-2.5 border-t border-[#F0EDE9] flex items-center gap-3">
                                    <span className={`text-[10px] font-medium ${
                                      msg.contextUsed ? "text-[#10B981]" : "text-[#B0ADA9]"
                                    }`}>
                                      {msg.contextUsed ? "✓ Context used" : "○ No context"}
                                    </span>
                                    {msg.webSearchUsed && (
                                      <span className="flex items-center gap-1 text-[10px] font-medium text-[#3B82F6]">
                                        <Globe size={10} /> Web searched
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className={`flex items-center gap-3 mt-2 transition-opacity
                                ${hoveredId === msgId ? "opacity-100" : "opacity-0"}`}>
                                {msg.ts && (
                                  <span className="text-[11px] text-[#B0ADA9]">
                                    {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                                <button onClick={() => copyMessage(msg.content, msgId)}
                                  className="flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors">
                                  {copiedId === msgId ? <Check size={12} /> : <Copy size={12} />}
                                  {copiedId === msgId ? "Copied" : "Copy"}
                                </button>
                                {group.role === "user" && (
                                  <button onClick={() => startEdit(msg, globalIdx)}
                                    className="flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors">
                                    <Edit2 size={12} /> Edit
                                  </button>
                                )}
                                {group.role === "assistant" && mIdx === group.messages.length - 1 && gIdx === messageGroups.length - 1 && (
                                  <button onClick={regenerate} disabled={loading}
                                    className="flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors disabled:opacity-40">
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

            {loading && (
              <div className="flex gap-4 items-start mb-8">
                <div className="w-8 h-8 rounded-full bg-[#0F0F0F] flex items-center justify-center text-[15px] shrink-0">🤖</div>
                <div className="bg-white border border-[#E5E2DE] rounded-2xl px-5 py-4">
                  <div className="flex gap-1.5 items-center h-6">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-[#B0ADA9] animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-3 sm:px-4 py-3 sm:py-4 bg-white border-t border-[#E5E2DE] shrink-0 border-r border-r-[#E5E2DE]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-[800px] mx-auto">
            {/* Context note panel */}
            {contextNoteOpen && (
              <div className="mb-2 rounded-xl border border-amber-200 overflow-hidden bg-white">
                <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-100">
                  <span className="text-[11px] font-semibold text-amber-700">📌 Pinned context note — always sent to AI in this chat</span>
                  <button onClick={() => setContextNoteOpen(false)} className="text-amber-400 hover:text-amber-700 transition-colors"><X size={13} /></button>
                </div>
                <textarea
                  value={contextNote}
                  onChange={e => saveContextNote(e.target.value)}
                  placeholder="Add key facts, ongoing context, or reminders the AI should always know in this chat…"
                  rows={3}
                  className="w-full px-3 py-2.5 text-[13px] text-[#1A1A1A] bg-white resize-none focus:outline-none"
                />
                {sessionSummary && (
                  <div className="px-3 py-2 border-t border-amber-100 bg-amber-50/50">
                    <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider mb-1">Auto-retained summary (generated from chat history)</p>
                    <p className="text-[11px] text-[#737373] whitespace-pre-wrap leading-relaxed">{sessionSummary}</p>
                  </div>
                )}
              </div>
            )}
            {/* Large text warning banner */}
            {input.length > MAX_CHARS && (
              <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[12px]">
                <span className="text-amber-700">
                  ⚠️ Message is <strong>{input.length.toLocaleString()}</strong> chars — this may be too large. Convert to a file?
                </span>
                <button
                  onClick={convertToFile}
                  className="shrink-0 px-3 py-1 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors">
                  Convert to .txt
                </button>
              </div>
            )}
            {/* Attached files preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachedFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#F0EDE9] rounded-lg text-[12px] text-[#737373]">
                    {file.type.startsWith("image/") ? "🖼️" : (file.name.endsWith(".zip") ? "📦" : "📄")} {file.name.slice(0, 20)}{file.name.length > 20 ? "…" : ""}
                    <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                      className="ml-0.5 hover:text-[#E8521A] transition-colors">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative flex items-end gap-2 sm:gap-3 bg-[#F7F5F2] rounded-2xl px-3 sm:px-4 py-2 sm:py-3 border border-[#E5E2DE] focus-within:border-[#E8521A] transition-colors">
              <QuickActionsDropdown onSelectAction={handleQuickAction} />
              <VoiceInputButton onTranscript={handleVoiceTranscript} />
              <FileUpload onFilesSelected={(f) => setAttachedFiles(prev => [...prev, ...f])} />
              <WebSearchButton onSearch={(query) => { setInput(query); setTimeout(() => textareaRef.current?.focus(), 0); }} />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKey}
                placeholder="Message Buddies AI or type a command..."
                rows={1}
                className="flex-1 bg-transparent text-[14px] sm:text-[15px] text-[#1A1A1A] placeholder-[#B0ADA9] resize-none focus:outline-none leading-relaxed"
                style={{ maxHeight: "120px", minHeight: "24px" }}
              />
              {input.length > 8000 && (
                <span className={`text-[10px] font-mono shrink-0 self-end mb-1 ${
                  input.length > MAX_CHARS ? "text-red-500" : "text-amber-500"
                }`}>
                  {input.length.toLocaleString()}/{MAX_CHARS.toLocaleString()}
                </span>
              )}
              {loading ? (
                <button onClick={stopResponse}
                  title="Stop generating"
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#1A1A1A] text-white hover:bg-[#E8521A] transition-all">
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button onClick={() => send()} disabled={!input.trim() && attachedFiles.length === 0}
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all
                    disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] bg-[#E8521A] text-white hover:bg-[#c94415]">
                  <Send size={16} />
                </button>
              )}
            </div>
            <p className="hidden sm:block text-[11px] text-[#B0ADA9] text-center mt-2">
              Enter to send · Shift+Enter for new line · ⚡ Actions · 🎤 Voice · 🌐 Web · 📎 Attach · Ctrl+V paste image
            </p>
          </div>
        </div>
        </div>{/* end chat column */}

        {/* Code panel */}
        {codeOpen && (
          <div className="flex flex-col w-[45%] border-l border-[#E5E2DE] overflow-hidden bg-[#0F0F0F]">
            {/* Code panel header */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#1A1A1A] border-b border-[#2D2D2D] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Code2 size={12} className="text-[#E8521A] shrink-0" />
                <span className="text-[10px] text-[#B0ADA9] font-mono truncate">{codeUrl}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-3">
                {!codeBlocked && (
                  <button
                    onClick={() => setCodeRetryKey(k => k + 1)}
                    className="flex items-center gap-1 text-[10px] text-[#737373] hover:text-white px-1.5 py-1 rounded transition-colors">
                    <RefreshCw size={10} />
                  </button>
                )}
                <a
                  href={codeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-[#E8521A] hover:text-[#FDBA9A] px-2 py-1 rounded bg-[#2D2D2D] transition-colors font-semibold">
                  <ExternalLink size={10} /> Open
                </a>
                <button
                  onClick={() => setCodeOpen(false)}
                  className="text-[#737373] hover:text-white transition-colors p-1 rounded">
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* iframe or fallback */}
            {codeBlocked ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
                <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] border border-[#2D2D2D] flex items-center justify-center">
                  <Code2 size={24} className="text-[#E8521A]" />
                </div>
                <div>
                  <p className="text-white font-semibold text-[14px] mb-2">Open VS Code in browser</p>
                  <p className="text-[#737373] text-[12px] max-w-[280px]">
                    VS Code can&apos;t be embedded due to browser security restrictions.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-[280px]">
                  <a
                    href={codeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#E8521A] text-white rounded-xl font-semibold text-[13px] hover:bg-[#c94415] transition-colors">
                    <Code2 size={14} /> Open github.dev <ExternalLink size={11} />
                  </a>
                  <a
                    href="https://vscode.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2D2D2D] text-[#B0ADA9] rounded-xl font-semibold text-[12px] hover:bg-[#3A3A3A] transition-colors">
                    vscode.dev <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            ) : (
              <iframe
                key={codeRetryKey}
                src={codeUrl}
                className="flex-1 w-full border-none bg-[#1E1E1E]"
                title="VS Code"
                allow="clipboard-read; clipboard-write"
              />
            )}
          </div>
        )}

        </div>{/* end content row */}
      </div>

    </div>

    <ContextPreviewModal isOpen={contextModalOpen} onClose={() => setContextModalOpen(false)} />
    <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

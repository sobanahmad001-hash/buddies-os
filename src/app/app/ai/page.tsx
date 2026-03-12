"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Plus, Send, Copy, RotateCcw, Trash2,
  MessageSquare, Check
} from "lucide-react";

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;
  const k = () => keyIdx++;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join("\n");
      nodes.push(
        <CodeBlock key={k()} code={code} lang={lang} />
      );
      i++;
      continue;
    }

    // H1
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={k()} className="text-xl font-bold text-[#1A1A1A] mt-4 mb-2 first:mt-0">{inlineRender(line.slice(2))}</h1>);
      i++; continue;
    }
    // H2
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={k()} className="text-base font-bold text-[#1A1A1A] mt-3 mb-1.5 first:mt-0">{inlineRender(line.slice(3))}</h2>);
      i++; continue;
    }
    // H3
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={k()} className="text-sm font-bold text-[#1A1A1A] mt-2 mb-1 first:mt-0">{inlineRender(line.slice(4))}</h3>);
      i++; continue;
    }
    // HR
    if (line.match(/^[-*]{3,}$/)) {
      nodes.push(<hr key={k()} className="border-[#E5E2DE] my-3" />);
      i++; continue;
    }
    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={k()} className="border-l-2 border-[#E8521A] pl-3 my-2 text-[#737373] italic text-sm">
          {inlineRender(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }
    // Unordered list — collect consecutive items
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={k()} className="list-none my-2 space-y-1 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-[#1A1A1A]">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#E8521A] shrink-0" />
              <span>{inlineRender(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    // Ordered list
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      let num = 1;
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      nodes.push(
        <ol key={k()} className="list-none my-2 space-y-1 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 text-sm text-[#1A1A1A]">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#F0EDE9] text-[#E8521A] text-[10px] font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
              <span>{inlineRender(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }
    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={k()} className="h-2" />);
      i++; continue;
    }
    // Normal paragraph
    nodes.push(
      <p key={k()} className="text-sm text-[#1A1A1A] leading-relaxed">
        {inlineRender(line)}
      </p>
    );
    i++;
  }
  return nodes;
}

function inlineRender(text: string): React.ReactNode {
  // Split on bold, italic, inline code, links
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.+?\]\(.+?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-[#1A1A1A]">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-[12px] bg-[#F0EDE9] text-[#E8521A] px-1.5 py-0.5 rounded-md">{part.slice(1, -1)}</code>;
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
    <div className="my-3 rounded-xl overflow-hidden border border-[#2A2A2A]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A]">
        <span className="text-[10px] text-[#525252] font-mono uppercase tracking-widest">{lang || "code"}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[10px] text-[#525252] hover:text-white transition-colors">
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#0F0F0F] text-[#E5E2DE] text-[12px] font-mono p-4 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message { role: "user" | "assistant"; content: string; ts?: string; }
interface Session { id: string; title: string; created_at: string; messages?: Message[]; }

// ── Group sessions by date ────────────────────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
export default function AIPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

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
    textareaRef.current?.focus();
  }

  async function openSession(s: Session) {
    setActiveSession(s);
    setMessages([]);
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
    setDeletingId(id);
    await fetch(`/api/ai/sessions?id=${id}`, { method: "DELETE" });
    if (activeSession?.id === id) startNewChat();
    await loadSessions();
    setDeletingId(null);
  }

  function copyMessage(content: string, idx: number) {
    navigator.clipboard.writeText(content);
    setCopiedId(idx);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function send(overrideInput?: string) {
    const text = (overrideInput ?? input).trim();
    if (!text || loading) return;
    const userMsg: Message = { role: "user", content: text, ts: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: activeSession?.id ?? null,
          history: messages.slice(-12)
        })
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.response ?? data.error ?? "Something went wrong.",
        ts: new Date().toISOString()
      };
      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      // Save / update session
      if (activeSession?.id) {
        await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSession.id, messages: finalMessages })
        });
      } else {
        const title = text.slice(0, 50);
        const res = await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, messages: finalMessages })
        });
        if (res.ok) {
          const { sessionId } = await res.json();
          if (sessionId) setActiveSession({ id: sessionId, title, created_at: new Date().toISOString() });
        }
      }
      await loadSessions();
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again.", ts: new Date().toISOString() }]);
    }
    setLoading(false);
  }

  async function regenerate() {
    if (messages.length < 2) return;
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    const trimmed = messages.slice(0, -1); // remove last assistant message
    setMessages(trimmed);
    await send(lastUser.content);
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
  const lastAiIdx = messages.map((m, i) => m.role === "assistant" ? i : -1).filter(i => i >= 0).at(-1) ?? -1;

  return (
    <div className="flex flex-1 overflow-hidden bg-[#F7F5F2]">

      {/* Mobile overlay — closes sidebar when tapping outside */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Session sidebar ─────────────────────────────────────────────── */}
      <div className={`flex flex-col bg-[#0F0F0F] border-r border-[#1E1E1E] transition-all duration-200 shrink-0
        md:relative fixed left-0 top-0 h-full z-40
        ${sidebarOpen ? "w-[220px]" : "w-0 overflow-hidden"}`}>

        {/* New chat */}
        <div className="p-3 border-b border-[#1E1E1E]">
          <button onClick={startNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#E8521A] text-white text-xs font-semibold hover:bg-[#c94415] transition-colors">
            <Plus size={13} /> New Chat
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, items]) => {
            if (!items.length) return null;
            return (
              <div key={group} className="mb-2">
                <div className="px-3 py-1.5 text-[9px] font-bold text-[#3A3A3A] uppercase tracking-widest">{group}</div>
                {items.map(s => (
                  <div key={s.id}
                    onClick={() => openSession(s)}
                    className={`group relative mx-2 mb-0.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                      ${activeSession?.id === s.id ? "bg-[#1E1E1E] text-white" : "text-[#737373] hover:bg-[#1A1A1A] hover:text-[#B0ADA9]"}`}>
                    <div className="flex items-start gap-2">
                      <MessageSquare size={11} className="shrink-0 mt-0.5 opacity-50" />
                      <span className="text-[11px] leading-tight line-clamp-2 flex-1">{s.title}</span>
                    </div>
                    {/* Delete on hover */}
                    <button
                      onClick={e => deleteSession(s.id, e)}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-[#525252] hover:text-red-400 p-0.5 rounded">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-[#3A3A3A] text-[11px]">No chats yet</div>
          )}
        </div>
      </div>

      {/* ── Main chat area ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#E5E2DE] shrink-0">
          <button onClick={() => setSidebarOpen(v => !v)}
            className="flex flex-col justify-center items-center w-8 h-8 gap-1.5 text-[#737373] hover:text-[#1A1A1A] transition-colors rounded-lg hover:bg-[#F0EDE9]"
            title={sidebarOpen ? "Hide sessions" : "Show sessions"}>
            <span className="w-4 h-0.5 bg-current rounded-full transition-all" />
            <span className="w-4 h-0.5 bg-current rounded-full transition-all" />
            <span className="w-4 h-0.5 bg-current rounded-full transition-all" />
          </button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#1A1A1A]">
              {activeSession?.title ?? "New Chat"}
            </div>
            {messages.length > 0 && (
              <div className="text-[10px] text-[#B0ADA9]">{messages.length} messages</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0F0F0F]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[10px] text-white font-medium">Claude</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-[720px] mx-auto space-y-6">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#0F0F0F] flex items-center justify-center mb-4">
                  <span className="text-xl">🤖</span>
                </div>
                <h2 className="text-lg font-bold text-[#1A1A1A] mb-1">Buddies AI</h2>
                <p className="text-sm text-[#737373] mb-8">Ask anything. Get structured, actionable answers.</p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-[480px]">
                  {[
                    "What's the team working on today?",
                    "Summarize my active projects",
                    "What decisions have I made this week?",
                    "Give me a focus recommendation",
                  ].map(q => (
                    <button key={q} onClick={() => { setInput(q); send(q); }}
                      className="text-left text-xs text-[#737373] bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 hover:border-[#E8521A] hover:text-[#1A1A1A] transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg, idx) => (
              <div key={idx}
                onMouseEnter={() => setHoveredId(idx)}
                onMouseLeave={() => setHoveredId(null)}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

                {/* AI avatar */}
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-[#0F0F0F] flex items-center justify-center text-sm shrink-0 mt-0.5">🤖</div>
                )}

                <div className={`relative max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Bubble */}
                  <div className={`px-4 py-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-[#E8521A] text-white rounded-tr-sm"
                      : "bg-white border border-[#E5E2DE] rounded-tl-sm"
                  }`}>
                    {msg.role === "user" ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="prose-sm">{renderMarkdown(msg.content)}</div>
                    )}
                  </div>

                  {/* Actions row */}
                  <div className={`flex items-center gap-2 mt-1.5 transition-opacity duration-150
                    ${hoveredId === idx ? "opacity-100" : "opacity-0"}`}>
                    {msg.ts && (
                      <span className="text-[10px] text-[#B0ADA9]">
                        {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {msg.role === "assistant" && (
                      <>
                        <button onClick={() => copyMessage(msg.content, idx)}
                          className="flex items-center gap-1 text-[10px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors">
                          {copiedId === idx ? <Check size={11} /> : <Copy size={11} />}
                          {copiedId === idx ? "Copied" : "Copy"}
                        </button>
                        {idx === lastAiIdx && (
                          <button onClick={regenerate} disabled={loading}
                            className="flex items-center gap-1 text-[10px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors disabled:opacity-40">
                            <RotateCcw size={11} /> Regenerate
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* User avatar */}
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5">S</div>
                )}
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-[#0F0F0F] flex items-center justify-center text-sm shrink-0">🤖</div>
                <div className="bg-white border border-[#E5E2DE] rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#B0ADA9] animate-bounce"
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
        <div className="px-4 py-4 bg-white border-t border-[#E5E2DE] shrink-0">
          <div className="max-w-[720px] mx-auto">
            <div className="flex items-end gap-3 bg-[#F7F5F2] rounded-2xl px-4 py-3 border border-[#E5E2DE] focus-within:border-[#E8521A] transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKey}
                placeholder="Message Buddies AI..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder-[#B0ADA9] resize-none focus:outline-none leading-relaxed"
                style={{ maxHeight: "120px" }}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all
                  disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] bg-[#E8521A] text-white hover:bg-[#c94415]">
                <Send size={14} />
              </button>
            </div>
            <p className="text-[10px] text-[#B0ADA9] text-center mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>

    </div>
  );
}

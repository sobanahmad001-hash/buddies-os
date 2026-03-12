"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus, Send, Copy, RotateCcw, Trash2, Edit2,
  MessageSquare, Check, ChevronDown
} from "lucide-react";
import ContextPreviewModal from "@/components/ContextPreviewModal";

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

interface Message { role: "user" | "assistant"; content: string; ts?: string; }
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
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again.", ts: new Date().toISOString() }]);
    }
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
          {/* Context badge */}
          <button onClick={() => setContextModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A] text-[11px] font-medium transition-colors">
            <span>🧠</span>
            <span>Context</span>
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
        </div>

        {/* Messages */}
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
                                  ? "bg-white border border-[#E5E2DE]"
                                  : "bg-[#F0EDE9]"
                              }`}>
                                {group.role === "user" ? (
                                  <p className="text-[15px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                ) : (
                                  <div className="prose-sm">{renderMarkdown(msg.content)}</div>
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
        <div className="px-4 py-4 bg-white border-t border-[#E5E2DE] shrink-0">
          <div className="max-w-[800px] mx-auto">
            <div className="flex items-end gap-3 bg-[#F7F5F2] rounded-2xl px-4 py-3 border border-[#E5E2DE] focus-within:border-[#E8521A] transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKey}
                placeholder="Message Buddies AI..."
                rows={1}
                className="flex-1 bg-transparent text-[15px] text-[#1A1A1A] placeholder-[#B0ADA9] resize-none focus:outline-none leading-relaxed"
                style={{ maxHeight: "120px" }}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all
                  disabled:bg-[#E5E2DE] disabled:text-[#B0ADA9] bg-[#E8521A] text-white hover:bg-[#c94415]">
                <Send size={16} />
              </button>
            </div>
            <p className="text-[11px] text-[#B0ADA9] text-center mt-2">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

    </div>

    <ContextPreviewModal isOpen={contextModalOpen} onClose={() => setContextModalOpen(false)} />
  );
}

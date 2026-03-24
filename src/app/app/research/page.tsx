"use client";
import { useEffect, useRef, useState } from "react";
import {
  Send, Plus, Trash2, ExternalLink, Check, Copy,
  FolderKanban, Globe, ChevronDown, ChevronUp, X, Menu,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; status: string };
type Session = { id: string; topic: string; created_at: string; status: string };
type Citation = { title: string; url: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  suggestedTasks?: string[];
  ts?: string;
};

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-[#2D2D2D]">
      <p className="text-[10px] font-bold text-[#737373] uppercase tracking-wider mb-2 flex items-center gap-1">
        <Globe size={10} /> Sources
      </p>
      <div className="space-y-1">
        {citations.map((c, i) => (
          <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-[#B5622A] hover:underline truncate">
            <ExternalLink size={9} className="shrink-0" />
            <span className="truncate">{c.title || c.url}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function SuggestedTasks({ tasks, projects, onSend }: {
  tasks: string[];
  projects: Project[];
  onSend: (task: string, projectId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [sending, setSending] = useState<Record<number, boolean>>({});
  const [sent, setSent] = useState<Record<number, boolean>>({});
  const [targetProject, setTargetProject] = useState<Record<number, string>>({});

  if (!tasks.length) return null;

  return (
    <div className="mt-3 border border-[#B5622A20] rounded-xl bg-[#1A1A1A] overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#F5EDE0] transition-colors">
        <span className="text-[11px] font-bold text-[#B5622A] uppercase tracking-wider">
          💡 {tasks.length} suggested action{tasks.length > 1 ? "s" : ""}
        </span>
        {expanded ? <ChevronUp size={13} className="text-[#B5622A]" /> : <ChevronDown size={13} className="text-[#B5622A]" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-start gap-2 bg-[#1A1A1A] rounded-lg p-3 border border-[#2D2D2D]">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-[#C8C5C0] leading-relaxed">{task}</p>
                {projects.length > 0 && (
                  <select
                    value={targetProject[i] ?? ""}
                    onChange={e => setTargetProject(p => ({ ...p, [i]: e.target.value }))}
                    className="mt-1.5 text-[11px] px-2 py-1 border border-[#2D2D2D] rounded-lg bg-[#1A1A1A] focus:outline-none focus:border-[#B5622A] w-full"
                  >
                    <option value="">Select project to send to...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
              <button
                onClick={async () => {
                  const projectId = targetProject[i] ?? "";
                  if (!projectId) return;
                  setSending(prev => ({ ...prev, [i]: true }));
                  await onSend(task, projectId);
                  setSending(prev => ({ ...prev, [i]: false }));
                  setSent(prev => ({ ...prev, [i]: true }));
                }}
                disabled={sending[i] || sent[i] || !targetProject[i]}
                className={`shrink-0 flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-colors
                  ${sent[i] ? "bg-[#ECFDF5] text-[#10B981] border border-[#BBF7D0]"
                  : sending[i] ? "bg-[#1E1E1E] text-[#737373]"
                  : !targetProject[i] ? "bg-[#1E1E1E] text-[#525252] cursor-not-allowed"
                  : "bg-[#B5622A] text-white hover:bg-[#9A4E20]"}`}
              >
                {sent[i] ? <><Check size={10} /> Sent</> : sending[i] ? "..." : <>→ Send</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  const k = (() => { let n = 0; return () => n++; })();

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# "))   { nodes.push(<h1 key={k()} className="text-[16px] font-bold text-[#C8C5C0] mt-4 mb-2 first:mt-0">{line.slice(2)}</h1>); i++; continue; }
    if (line.startsWith("## "))  { nodes.push(<h2 key={k()} className="text-[14px] font-bold text-[#C8C5C0] mt-3 mb-1.5 first:mt-0">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { nodes.push(<h3 key={k()} className="text-[13px] font-semibold text-[#C8C5C0] mt-2 mb-1 first:mt-0">{line.slice(4)}</h3>); i++; continue; }
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) { items.push(lines[i].slice(2)); i++; }
      nodes.push(<ul key={k()} className="my-2 space-y-1 pl-1">{items.map((item, j) => (
        <li key={j} className="flex items-start gap-2 text-[13px] text-[#C8C5C0]">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#B5622A] shrink-0" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      nodes.push(<ol key={k()} className="my-2 space-y-1 pl-1">{items.map((item, j) => (
        <li key={j} className="flex items-start gap-2 text-[13px] text-[#C8C5C0]">
          <span className="shrink-0 w-5 h-5 rounded-full bg-[#1E1E1E] text-[#B5622A] text-[10px] font-bold flex items-center justify-center">{j + 1}</span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}</ol>);
      continue;
    }
    if (line.trim() === "") { nodes.push(<div key={k()} className="h-2" />); i++; continue; }
    nodes.push(<p key={k()} className="text-[13px] text-[#C8C5C0] leading-relaxed">{line}</p>);
    i++;
  }
  return nodes;
}

const STARTERS = [
  "What are the latest trends in AI-powered personal OS tools?",
  "Research gold XAU/USD market outlook for the next quarter",
  "What are the best marketing strategies for B2B SaaS tools?",
  "Analyze the competitive landscape for AI coding assistants",
];

export default function ResearchPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: proj }, sessRes] = await Promise.all([
      supabase.from("projects").select("id, name, status").eq("user_id", user.id).eq("status", "active").order("updated_at", { ascending: false }),
      fetch("/api/research/sessions").then(r => r.json()).catch(() => ({ sessions: [] })),
    ]);
    setProjects(proj ?? []);
    setSessions(sessRes.sessions ?? []);
  }

  function toggleProject(id: string) {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function loadSession(session: Session) {
    setActiveSessionId(session.id);
    setMessages([]);
    const res = await fetch("/api/research/sessions");
    const data = await res.json();
    const full = (data.sessions ?? []).find((s: any) => s.id === session.id);
    if (full?.result) {
      setMessages([
        { role: "user", content: full.topic },
        {
          role: "assistant",
          content: full.result.reply ?? full.raw_report ?? "Research complete.",
          citations: full.result.citations ?? full.sources ?? [],
          suggestedTasks: full.result.suggestedTasks ?? [],
        },
      ]);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("research_sessions").delete().eq("id", id);
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
    const sessRes = await fetch("/api/research/sessions").then(r => r.json()).catch(() => ({ sessions: [] }));
    setSessions(sessRes.sessions ?? []);
  }

  async function sendTask(task: string, projectId: string) {
    await fetch("/api/projects/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        title: task.slice(0, 200),
        description: `From research session${activeSessionId ? ` (${activeSessionId})` : ""}`,
        status: "todo",
        priority: 2,
      }),
    });
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg, ts: new Date().toISOString() }]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    try {
      const res = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          projectIds: selectedProjectIds,
          sessionId: activeSessionId,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `❌ ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.reply ?? "No response.",
          citations: data.citations ?? [],
          suggestedTasks: data.suggestedTasks ?? [],
          ts: new Date().toISOString(),
        }]);
        if (data.sessionId && !activeSessionId) setActiveSessionId(data.sessionId);
        const sessRes = await fetch("/api/research/sessions").then(r => r.json()).catch(() => ({ sessions: [] }));
        setSessions(sessRes.sessions ?? []);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Connection error: ${err.message}` }]);
    }
    setLoading(false);
  }

  function startNew() {
    setMessages([]);
    setActiveSessionId(null);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const selectedProjects = projects.filter(p => selectedProjectIds.includes(p.id));

  return (
    <div className="flex h-full bg-[#0D0D0D] overflow-hidden">

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-30" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Session sidebar */}
      <div className={`${
        mobileSidebarOpen
          ? "fixed left-0 top-0 h-full z-40 flex"
          : "hidden md:flex"
      } w-[220px] shrink-0 flex-col border-r border-[#2D2D2D] bg-[#1A1A1A]`}>
        <div className="px-4 py-4 border-b border-[#2D2D2D]">
          <button onClick={startNew}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#B5622A] text-white text-[12px] font-semibold hover:bg-[#9A4E20] transition-colors">
            <Plus size={13} /> New Research
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <p className="text-[10px] font-bold text-[#525252] uppercase tracking-widest px-4 mb-2">History</p>
          {sessions.length === 0 && <p className="text-[11px] text-[#525252] px-4 py-2">No sessions yet</p>}
          {sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s)}
              className={`group relative mx-2 mb-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                ${activeSessionId === s.id ? "bg-[#B5622A10] border border-[#B5622A30]" : "hover:bg-[#111111]"}`}>
              <p className="text-[11px] text-[#C8C5C0] font-medium truncate leading-snug">{s.topic}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${s.status === "complete" ? "bg-[#10B981]" : "bg-[#737373]"}`} />
                <span className="text-[10px] text-[#737373]">{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
              <button onClick={e => deleteSession(s.id, e)}
                className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5 rounded">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main research area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header — project selector */}
        <div className="px-3 md:px-6 py-2 md:py-3 bg-[#1A1A1A] border-b border-[#2D2D2D] shrink-0">
          <div className="flex items-center gap-2 max-w-[800px]">
            <button
              onClick={() => setMobileSidebarOpen(v => !v)}
              className="md:hidden flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[#2D2D2D] text-[#737373] transition-colors shrink-0">
              <Menu size={15} />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Globe size={13} className="text-[#B5622A] shrink-0" />
              <span className="text-[13px] font-semibold text-[#C8C5C0]">Research</span>
              <span className="hidden sm:inline text-[11px] text-[#737373] ml-1">· Live web search · Cited sources</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {selectedProjects.slice(0, 1).map(p => (
                <div key={p.id} className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-[#B5622A15] border border-[#B5622A30] rounded-full text-[11px] font-medium text-[#B5622A]">
                  <FolderKanban size={9} /> <span className="truncate max-w-[80px]">{p.name}</span>
                  <button onClick={() => toggleProject(p.id)} className="ml-0.5 hover:text-red-500 transition-colors"><X size={9} /></button>
                </div>
              ))}
              {selectedProjects.length > 1 && (
                <span className="hidden sm:inline text-[10px] text-[#B5622A] font-medium">+{selectedProjects.length - 1}</span>
              )}

              <div className="relative">
                <button onClick={() => setShowProjectPicker(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#2D2D2D] bg-[#111111] text-[11px] text-[#737373] hover:border-[#B5622A] hover:text-[#C8C5C0] transition-colors">
                  <FolderKanban size={11} />
                  <span className="hidden sm:inline">{selectedProjectIds.length === 0 ? "Link" : `${selectedProjectIds.length} linked`}</span>
                  <ChevronDown size={10} />
                </button>
                {showProjectPicker && (
                  <div className="absolute right-0 top-full mt-1 w-[200px] bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="p-2">
                      <p className="text-[10px] font-bold text-[#737373] uppercase tracking-widest px-2 mb-2">Select projects</p>
                      {projects.map(p => (
                        <button key={p.id} onClick={() => toggleProject(p.id)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[#111111] transition-colors text-left">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                            ${selectedProjectIds.includes(p.id) ? "bg-[#B5622A] border-[#B5622A]" : "border-[#2D2D2D]"}`}>
                            {selectedProjectIds.includes(p.id) && <Check size={9} className="text-white" />}
                          </div>
                          <span className="text-[12px] text-[#C8C5C0] truncate">{p.name}</span>
                        </button>
                      ))}
                      <button onClick={() => setShowProjectPicker(false)}
                        className="w-full mt-1 py-1.5 text-[11px] text-[#737373] hover:text-[#C8C5C0] border-t border-[#2D2D2D] transition-colors">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-[800px] mx-auto">

            {messages.length === 0 && (
              <div className="text-center pt-12">
                <div className="w-14 h-14 rounded-2xl bg-[#B5622A] flex items-center justify-center text-2xl mx-auto mb-5">🔍</div>
                <h2 className="text-[20px] font-bold text-[#C8C5C0] mb-2">Research</h2>
                <p className="text-[14px] text-[#737373] mb-3 max-w-[460px] mx-auto leading-relaxed">
                  Real-time web search with citations. Link projects to get research tailored to your work — findings turn into tasks with one click.
                </p>
                {selectedProjectIds.length > 0 && (
                  <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
                    {selectedProjects.map(p => (
                      <span key={p.id} className="text-[11px] px-2.5 py-1 bg-[#B5622A15] text-[#B5622A] rounded-full border border-[#B5622A30]">
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[600px] mx-auto mt-6">
                  {STARTERS.map(s => (
                    <button key={s} onClick={() => { setInput(s); setTimeout(() => textareaRef.current?.focus(), 0); }}
                      className="text-left text-[12px] text-[#737373] bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl px-4 py-3 hover:border-[#B5622A] hover:text-[#C8C5C0] hover:shadow-sm transition-all leading-relaxed">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-4 mb-6 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px]
                  ${msg.role === "user" ? "bg-[#B5622A] text-white font-bold text-[11px]" : "bg-[#0F0F0F] text-white"}`}>
                  {msg.role === "user" ? "You" : "🔍"}
                </div>
                <div className={`flex-1 max-w-[90%] ${msg.role === "user" ? "flex justify-end" : ""}`}>
                  <div className={`rounded-2xl px-5 py-4 ${msg.role === "user"
                    ? "bg-[#B5622A15] border border-[#B5622A30] inline-block"
                    : "bg-[#1A1A1A] border border-[#2D2D2D] w-full"}`}>
                    {msg.role === "user"
                      ? <p className="text-[14px] text-[#C8C5C0] leading-relaxed">{msg.content}</p>
                      : (
                        <>
                          <div>{renderMarkdown(msg.content)}</div>
                          {(msg.citations?.length ?? 0) > 0 && <CitationList citations={msg.citations!} />}
                          {(msg.suggestedTasks?.length ?? 0) > 0 && (
                            <SuggestedTasks tasks={msg.suggestedTasks!} projects={projects} onSend={sendTask} />
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <button onClick={() => { navigator.clipboard.writeText(msg.content); setCopiedId(`${i}`); setTimeout(() => setCopiedId(null), 2000); }}
                              className="flex items-center gap-1 text-[10px] text-[#525252] hover:text-[#737373] transition-colors">
                              {copiedId === `${i}` ? <Check size={10} /> : <Copy size={10} />}
                              {copiedId === `${i}` ? "Copied" : "Copy"}
                            </button>
                            {msg.ts && <span className="text-[10px] text-[#525252]">{new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                          </div>
                        </>
                      )
                    }
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-4 mb-6">
                <div className="w-8 h-8 rounded-full bg-[#0F0F0F] flex items-center justify-center text-[13px] shrink-0">🔍</div>
                <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#B0ADA9] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </div>
                    <span className="text-[11px] text-[#737373]">Searching the web...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-6 py-4 bg-[#1A1A1A] border-t border-[#2D2D2D] shrink-0">
          <div className="max-w-[800px] mx-auto">
            {selectedProjectIds.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2 text-[11px] text-[#737373]">
                <FolderKanban size={10} className="text-[#B5622A]" />
                <span>Researching with context from:</span>
                {selectedProjects.map(p => (
                  <span key={p.id} className="text-[#B5622A] font-semibold">{p.name}</span>
                ))}
              </div>
            )}
            <div className="bg-[#111111] rounded-2xl px-4 py-3 border border-[#2D2D2D] focus-within:border-[#B5622A] transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Research any topic — market trends, competitors, gold prices, technical analysis..."
                rows={2}
                className="w-full bg-transparent text-[14px] text-[#C8C5C0] placeholder:text-[#525252] resize-none focus:outline-none leading-relaxed"
                style={{ maxHeight: "160px", minHeight: "52px" }}
              />
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1.5 text-[10px] text-[#525252]">
                  <Globe size={10} className="text-[#10B981]" />
                  <span>Live web search</span>
                  {selectedProjectIds.length > 0 && (
                    <><span>·</span><FolderKanban size={10} className="text-[#B5622A]" /><span className="text-[#B5622A]">{selectedProjectIds.length} project{selectedProjectIds.length > 1 ? "s" : ""} linked</span></>
                  )}
                </div>
                <button onClick={send} disabled={loading || !input.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#B5622A] text-white hover:bg-[#9A4E20] disabled:opacity-40 transition-colors">
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


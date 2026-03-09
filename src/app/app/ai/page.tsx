"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Send, Loader2, Sparkles, Check, X, CheckCheck,
  FolderKanban, Scale, ShieldCheck, AlertTriangle,
  Sun, ChevronDown, History, Plus, Pencil
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Message = { role: "user" | "assistant"; content: string };
type ExtractedItem = {
  id: string;
  type: "project_update" | "decision" | "rule" | "blocker" | "daily_check";
  project?: string;
  content: string;
  update_type?: string;
  next_actions?: string;
  verdict?: string;
  probability?: number;
  rule_text?: string;
  severity?: number;
  context?: string;
  mood?: string;
  sleep_hours?: number;
  stress?: number;
  notes?: string;
  status: "pending" | "saved" | "dismissed";
  editing?: boolean;
};
type ThreadEntry = { message: Message; extractions?: ExtractedItem[] };
type Session = { id: string; title: string; updated_at: string };

const STARTERS = [
  "What did I work on this week?",
  "Which project is falling behind?",
  "What should I focus on today?",
  "Summarize my recent decisions",
];

const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  project_update: { icon: FolderKanban,  label: "Project Update", color: "text-[#2D6A4F]", bg: "bg-[#DCFCE7]" },
  blocker:        { icon: AlertTriangle, label: "Blocker",        color: "text-[#EF4444]", bg: "bg-[#FEE2E2]" },
  decision:       { icon: Scale,         label: "Decision",       color: "text-[#2C5F8A]", bg: "bg-[#DBEAFE]" },
  rule:           { icon: ShieldCheck,   label: "Rule",           color: "text-[#92400E]", bg: "bg-[#FEF9C3]" },
  daily_check:    { icon: Sun,           label: "Daily Check",    color: "text-[#7C3AED]", bg: "bg-[#EDE9FE]" },
};

function isQuestion(text: string) {
  const t = text.trim().toLowerCase();
  return t.endsWith("?") || t.startsWith("what ") || t.startsWith("which ") ||
    t.startsWith("how ") || t.startsWith("when ") || t.startsWith("why ") ||
    t.startsWith("summarize") || t.startsWith("show ") || t.startsWith("give me") ||
    t.startsWith("tell me") || t.length < 25;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ExtractionChip({ item, onSave, onDismiss, onEdit }: {
  item: ExtractedItem; onSave: () => void; onDismiss: () => void; onEdit: (val: string) => void;
}) {
  const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.project_update;
  const Icon = config.icon;
  const [editVal, setEditVal] = useState(item.rule_text ?? item.content);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
      item.status === "saved"     ? "bg-[#F0FDF4] border-[#BBF7D0] opacity-60" :
      item.status === "dismissed" ? "opacity-30 bg-[#F9FAFB] border-[#E5E7EB]" :
      "bg-white border-[#E5E2DE]"
    }`}>
      <div className={`w-6 h-6 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
        <Icon size={11} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${config.color}`}>{config.label}</span>
          {item.project && <span className="text-[10px] text-[#737373]">→ {item.project}</span>}
        </div>
        {isEditing ? (
          <div className="flex gap-1 mt-1">
            <input
              className="flex-1 text-[12px] border border-[#E5E2DE] rounded px-2 py-1 outline-none focus:border-[#CC785C]"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onEdit(editVal); setIsEditing(false); } if (e.key === "Escape") setIsEditing(false); }}
              autoFocus
            />
            <button onClick={() => { onEdit(editVal); setIsEditing(false); }}
              className="text-[11px] px-2 py-1 bg-[#1A1A1A] text-white rounded">OK</button>
          </div>
        ) : (
          <p className="text-[12px] text-[#404040] leading-snug">{item.rule_text ?? item.content}</p>
        )}
        {item.next_actions && item.next_actions !== "none" && item.next_actions !== "null" && (
          <p className="text-[11px] text-[#737373] mt-0.5 italic">next: {item.next_actions}</p>
        )}
      </div>
      {item.status === "pending" && (
        <div className="flex gap-1 shrink-0 mt-0.5">
          <button onClick={() => setIsEditing(!isEditing)}
            className="w-7 h-7 rounded-lg border border-[#E5E2DE] flex items-center justify-center hover:border-[#CC785C] transition-colors text-[#737373]">
            <Pencil size={11} />
          </button>
          <button onClick={onSave}
            className="w-7 h-7 rounded-lg bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors">
            <Check size={12} className="text-white" />
          </button>
          <button onClick={onDismiss}
            className="w-7 h-7 rounded-lg border border-[#E5E2DE] flex items-center justify-center hover:border-[#EF4444] hover:text-[#EF4444] transition-colors text-[#999]">
            <X size={12} />
          </button>
        </div>
      )}
      {item.status === "saved" && (
        <span className="text-[10px] text-[#2D6A4F] font-semibold shrink-0 mt-1">Saved ✓</span>
      )}
    </div>
  );
}

export default function AIPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didAutoSend = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
    });
    loadSessions();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loading, extracting]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !didAutoSend.current) {
      didAutoSend.current = true;
      setTimeout(() => send(q), 200);
    }
  }, [params]);

  async function loadSessions() {
    const res = await fetch("/api/ai/sessions");
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }

  async function loadSession(id: string) {
    const res = await fetch(`/api/ai/sessions?id=${id}`);
    const data = await res.json();
    if (data.session?.messages) {
      setThread(data.session.messages.map((m: Message) => ({ message: m })));
      setSessionId(id);
      setShowHistory(false);
    }
  }

  async function saveSession(newThread: ThreadEntry[], sid: string | null) {
    const messages = newThread.map(t => t.message);
    const res = await fetch("/api/ai/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, messages, title: messages[0]?.content?.slice(0, 60) }),
    });
    const data = await res.json();
    return data.sessionId ?? sid;
  }

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content };
    const newThread: ThreadEntry[] = [...thread, { message: userMsg }];
    const allMessages = newThread.map(t => t.message);
    setThread(newThread);
    setLoading(true);

    const isQ = isQuestion(content);
    const calls: Promise<any>[] = [
      fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: allMessages }) }).then(r => r.json()),
    ];
    if (!isQ) {
      calls.push(
        fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content }) }).then(r => r.json())
      );
    }

    const [aiData, extractData] = await Promise.all(calls);
    const assistantMsg: Message = { role: "assistant", content: aiData.text ?? "Error." };
    setLoading(false);

    const items: ExtractedItem[] = (!isQ ? (extractData?.items ?? []) : []).map((item: any, i: number) => ({
      ...item, id: `${Date.now()}-${i}`, status: "pending" as const,
    }));

    const finalThread: ThreadEntry[] = [
      ...newThread,
      { message: assistantMsg },
      ...(items.length > 0 ? [] : []),
    ];

    // Attach extractions to the user message
    const threadWithExtractions = finalThread.map((entry, idx) => {
      if (idx === newThread.length - 1 && items.length > 0) {
        return { ...entry, extractions: items };
      }
      return entry;
    });

    setThread(threadWithExtractions);
    if (!isQ) setExtracting(false);

    // Save session
    const newSid = await saveSession(threadWithExtractions, sessionId);
    if (!sessionId) setSessionId(newSid);
    loadSessions();
  }, [input, loading, thread, sessionId]);

  async function handleSave(msgIdx: number, itemId: string) {
    const item = thread[msgIdx]?.extractions?.find(e => e.id === itemId);
    if (!item) return;
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : {
      ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, status: "saved" as const } : e)
    }));
    await fetch("/api/ai/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
  }

  function handleDismiss(msgIdx: number, itemId: string) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : {
      ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, status: "dismissed" as const } : e)
    }));
  }

  function handleEdit(msgIdx: number, itemId: string, val: string) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : {
      ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, content: val, rule_text: e.rule_text ? val : e.rule_text } : e)
    }));
  }

  async function handleSaveAll() {
    for (let msgIdx = 0; msgIdx < thread.length; msgIdx++) {
      const pending = thread[msgIdx].extractions?.filter(e => e.status === "pending") ?? [];
      for (const item of pending) await handleSave(msgIdx, item.id);
    }
  }

  function startNewSession() {
    setThread([]);
    setSessionId(null);
    setShowHistory(false);
  }

  const pendingCount = thread.reduce((acc, t) =>
    acc + (t.extractions?.filter(e => e.status === "pending").length ?? 0), 0
  );

  return (
    <div className="flex flex-col bg-[#FAF9F7]" style={{ height: "100vh" }}>
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 pb-3 shrink-0 border-b border-[#E5E2DE] bg-[#FAF9F7]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#CC785C]" />
            <h1 className="text-[16px] font-semibold text-[#1A1A1A]">AI Assistant</h1>
            {/* History dropdown */}
            <div className="relative">
              <button onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-[11px] text-[#737373] hover:text-[#404040] transition-colors ml-2 px-2 py-1 rounded border border-[#E5E2DE] hover:border-[#CC785C]">
                <History size={11} />
                <span className="hidden md:inline">History</span>
                <ChevronDown size={10} />
              </button>
              {showHistory && (
                <div className="absolute top-8 left-0 w-64 bg-white border border-[#E5E2DE] rounded-xl shadow-lg z-20 overflow-hidden">
                  <button onClick={startNewSession}
                    className="flex items-center gap-2 w-full px-4 py-3 text-[12px] text-[#CC785C] font-semibold hover:bg-[#FAF9F7] border-b border-[#E5E2DE]">
                    <Plus size={13} /> New Session
                  </button>
                  {sessions.length === 0 && <p className="px-4 py-3 text-[12px] text-[#737373]">No sessions yet</p>}
                  {sessions.map(s => (
                    <button key={s.id} onClick={() => loadSession(s.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-[#FAF9F7] border-b border-[#E5E2DE] last:border-0 ${sessionId === s.id ? "bg-[#FAF9F7]" : ""}`}>
                      <p className="text-[12px] text-[#404040] truncate">{s.title}</p>
                      <p className="text-[10px] text-[#737373] mt-0.5">{timeAgo(s.updated_at)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {pendingCount > 0 && (
            <button onClick={handleSaveAll}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
              <CheckCheck size={13} />
              Save all ({pendingCount})
            </button>
          )}
        </div>
        <p className="text-[11px] text-[#737373] mt-0.5 hidden md:block">Talk naturally. Items extracted from messages appear below for one-tap saving.</p>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-4 space-y-4">
        {thread.length === 0 && (
          <div className="space-y-4 max-w-xl">
            <div className="grid grid-cols-2 gap-2">
              {STARTERS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left text-[12px] text-[#404040] bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 hover:border-[#CC785C]/40 transition-colors">
                  {s}
                </button>
              ))}
            </div>
            <div className="bg-[#1A1A1A] rounded-xl p-4">
              <p className="text-[11px] font-semibold text-[#CC785C] uppercase tracking-wide mb-2">Try saying</p>
              <p className="text-[12px] text-[#AAA] leading-relaxed italic">
                "Spent morning on Raahbaan, finalized investor deck. Blocked on legal structure — need to choose between LLC and LTD by Friday. Should never rush entity decisions. Slept 5 hours, feeling anxious."
              </p>
              <p className="text-[11px] text-[#555] mt-2">→ Extracts: update · blocker · decision · rule · daily check</p>
            </div>
          </div>
        )}

        {thread.map((entry, msgIdx) => (
          <div key={msgIdx} className="space-y-2">
            <div className={`flex ${entry.message.role === "user" ? "justify-end" : "justify-start"}`}>
              {entry.message.role === "user" ? (
                <div className="bg-[#1A1A1A] text-white rounded-2xl rounded-br-sm px-4 py-3 max-w-[85%] md:max-w-xl">
                  <p className="text-[13px] leading-relaxed">{entry.message.content}</p>
                </div>
              ) : (
                <div className="bg-white border border-[#E5E2DE] rounded-2xl rounded-bl-sm px-4 py-4 max-w-[85%] md:max-w-xl">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={11} className="text-[#CC785C]" />
                    <span className="text-[10px] font-semibold text-[#CC785C] uppercase tracking-wide">Buddies AI</span>
                  </div>
                  <div className="text-[13px] text-[#404040] leading-relaxed prose prose-sm max-w-none
                    prose-headings:text-[#1A1A1A] prose-headings:font-semibold
                    prose-strong:text-[#1A1A1A] prose-strong:font-semibold
                    prose-li:text-[#404040] prose-p:text-[#404040]">
                    <ReactMarkdown>{entry.message.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            {entry.extractions && entry.extractions.length > 0 && (
              <div className="flex justify-end">
                <div className="max-w-[85%] md:max-w-xl w-full space-y-1.5">
                  <p className="text-[10px] text-[#737373] font-semibold uppercase tracking-wide px-1">
                    Extracted — tap ✎ to edit, ✓ to save
                  </p>
                  {entry.extractions.map(item => (
                    <ExtractionChip
                      key={item.id} item={item}
                      onSave={() => handleSave(msgIdx, item.id)}
                      onDismiss={() => handleDismiss(msgIdx, item.id)}
                      onEdit={(val) => handleEdit(msgIdx, item.id, val)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-[#CC785C]" />
              <span className="text-[12px] text-[#737373]">Thinking...</span>
            </div>
          </div>
        )}
        {extracting && (
          <div className="flex justify-end">
            <div className="bg-[#FAF9F7] border border-[#E5E2DE] rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 size={11} className="animate-spin text-[#737373]" />
              <span className="text-[11px] text-[#737373]">Extracting...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 md:px-8 pb-4 pt-3 shrink-0 border-t border-[#E5E2DE] bg-[#FAF9F7]">
        <div className="flex items-center gap-2 bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 focus-within:border-[#CC785C]/40 transition-colors">
          <input
            className="flex-1 bg-transparent outline-none text-[13px] text-[#404040] placeholder:text-[#999]"
            placeholder="Talk about your work, blockers, decisions..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            disabled={loading}
            autoFocus
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors disabled:opacity-40 shrink-0">
            {loading ? <Loader2 size={13} className="animate-spin text-white" /> : <Send size={14} className="text-white" />}
          </button>
        </div>
        <p className="text-[10px] text-[#999] mt-1.5 text-center">Questions get answers · Statements get extracted and saved</p>
      </div>
    </div>
  );
}

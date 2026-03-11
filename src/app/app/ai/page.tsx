"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Message { role: "user" | "assistant"; content: string; timestamp?: Date; }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-2 py-1 rounded-md border border-[#E5E2DE] text-[#737373] hover:text-[#1A1A1A] hover:border-[#1A1A1A] flex items-center gap-1">
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function MessageBubble({ msg, isLast, onRegenerate }: { msg: Message; isLast: boolean; onRegenerate?: () => void }) {
  const isUser = msg.role === "user";
  const lines = msg.content.split("\n");

  const formatted = lines.map((line, i) => {
    // Bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : p
    );
    const isHeader = line.startsWith("# ") || line.startsWith("## ") || line.startsWith("### ");
    const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("• ") || /^\d+\.\s/.test(line.trim());

    if (isHeader) {
      const text = line.replace(/^#+\s/, "");
      return <div key={i} className="font-semibold text-[#1A1A1A] mt-3 mb-1">{text}</div>;
    }
    if (isBullet) {
      return <div key={i} className="flex gap-2 text-sm leading-relaxed ml-2">
        <span className="text-[#E8521A] shrink-0 mt-0.5">·</span>
        <span>{parts}</span>
      </div>;
    }
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <div key={i} className="text-sm leading-relaxed">{parts}</div>;
  });

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] bg-[#1A1A1A] text-white text-sm rounded-2xl rounded-tr-md px-4 py-3 leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-5 group">
      <div className="w-7 h-7 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">B</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold text-[#737373] uppercase tracking-wider mb-2">Buddies AI</div>
        <div className="text-[#1A1A1A] space-y-0.5">{formatted}</div>
        <div className="flex items-center gap-2 mt-2">
          <CopyButton text={msg.content} />
          {isLast && onRegenerate && (
            <button onClick={onRegenerate}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-2 py-1 rounded-md border border-[#E5E2DE] text-[#737373] hover:text-[#1A1A1A] hover:border-[#1A1A1A]">
              ↺ Regenerate
            </button>
          )}
          {msg.timestamp && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#B0ADA9]">
              {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); loadSession(user.id); }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadSession(uid: string) {
    const { data, error } = await supabase.from("ai_sessions").select("id, messages")
      .eq("user_id", uid).order("updated_at", { ascending: false }).limit(1).single();
    if (error || !data) return;
    setSessionId(data.id);
    const msgs = (data.messages ?? []).map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp) : undefined
    }));
    if (msgs.length > 0) setMessages(msgs);
  }

  async function saveSession(msgs: Message[]) {
    if (!userId) return;
    const payload = msgs.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp?.toISOString() }));
    if (sessionId) {
      await supabase.from("ai_sessions").update({ messages: payload, updated_at: new Date().toISOString() }).eq("id", sessionId);
    } else {
      const { data } = await supabase.from("ai_sessions").insert({ user_id: userId, messages: payload }).select("id").single();
      if (data) setSessionId(data.id);
    }
  }

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const send = useCallback(async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    // Extract in background
    fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) })
      .then(r => r.json()).then(d => {
        if (d.type === "new_project" && d.projectName) {
          fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: d.projectName }) });
        } else if (d.type && d.type !== "unknown" && d.content) {
          fetch("/api/ai/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: d.type, content: d.content }) });
        }
      }).catch(() => {});

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })) })
      });
      const d = await res.json();
      const aiMsg: Message = { role: "assistant", content: d.text ?? "No response.", timestamp: new Date() };
      const finalMsgs = [...newMsgs, aiMsg];
      setMessages(finalMsgs);
      saveSession(finalMsgs);
    } catch (e: any) {
      const errMsg: Message = { role: "assistant", content: `Error: ${e.message}`, timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, messages, loading]);

  const regenerate = useCallback(async () => {
    if (loading || messages.length < 2) return;
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    const withoutLast = messages.slice(0, -1);
    setMessages(withoutLast);
    setTimeout(() => send(lastUser.content), 50);
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = async () => {
    setMessages([]);
    setSessionId(null);
    if (userId && sessionId) {
      await supabase.from("ai_sessions").delete().eq("id", sessionId);
    }
  };

  const quickPrompts = [
    "What should I focus on today?",
    "Summarize my active projects",
    "Any rule violations recently?",
    "Research limo market in Dubai",
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FAFAFA]">
      {/* Header */}
      <div className="border-b border-[#E5E2DE] bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-[#1A1A1A]">AI Assistant</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#2D6A4F] font-semibold">claude-sonnet-4-6</span>
          </div>
          <p className="text-xs text-[#737373] mt-0.5">Talk naturally · Shift+Enter for new line</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={clearChat} className="text-xs text-[#737373] hover:text-[#EF4444] px-3 py-1.5 rounded-lg border border-[#E5E2DE] hover:border-[#EF4444] transition-colors">
              Clear chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-[720px] mx-auto">
          {messages.length === 0 && (
            <div className="py-12">
              <div className="w-12 h-12 rounded-2xl bg-[#E8521A] flex items-center justify-center text-white font-bold text-lg mb-4 mx-auto">B</div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A] text-center mb-1">Buddies AI</h2>
              <p className="text-sm text-[#737373] text-center mb-8">Your personal intelligence OS. Ask anything.</p>
              <div className="grid grid-cols-2 gap-2">
                {quickPrompts.map((p, i) => (
                  <button key={i} onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-[#E5E2DE] bg-white hover:border-[#E8521A] hover:bg-[#FFF8F5] transition-colors text-[#404040]">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              isLast={i === messages.length - 1 && msg.role === "assistant"}
              onRegenerate={i === messages.length - 1 && msg.role === "assistant" ? regenerate : undefined}
            />
          ))}

          {loading && (
            <div className="flex gap-3 mb-5">
              <div className="w-7 h-7 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">B</div>
              <div className="flex items-center gap-1 pt-2">
                <div className="w-2 h-2 rounded-full bg-[#E8521A] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#E8521A] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-[#E8521A] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#E5E2DE] bg-white px-6 py-4 shrink-0">
        <div className="max-w-[720px] mx-auto">
          <div className="flex gap-3 items-end bg-[#F7F5F2] rounded-2xl px-4 py-3 border border-[#E5E2DE] focus-within:border-[#E8521A] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder="Talk, upload a file, or say 'add Anka Diversify for me'..."
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder-[#B0ADA9] resize-none focus:outline-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: "24px", maxHeight: "160px" }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-[#E8521A] flex items-center justify-center text-white disabled:opacity-30 hover:bg-[#c94415] transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-[#B0ADA9]">Enter to send · Shift+Enter for new line</p>
            {messages.length > 0 && (
              <p className="text-[10px] text-[#B0ADA9]">{messages.length} messages</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Send, Bot, User } from "lucide-react";

const DEPT_META: Record<string, { color: string }> = {
  design:      { color: "#8B5CF6" },
  development: { color: "#3B82F6" },
  marketing:   { color: "#10B981" },
};

export default function DeptProjectAssistantPage() {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const meta = DEPT_META[slug] ?? { color: "#E8521A" };

  useEffect(() => {
    fetch(`/api/dept/${slug}/projects/${projectId}/chat`)
      .then(r => r.json()).then(d => setMessages(d.messages ?? []));
  }, [projectId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    const res = await fetch(`/api/dept/${slug}/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, projectId }),
    });
    const data = await res.json();
    if (data.reply) setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    setLoading(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F5F2]">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${meta.color}15` }}>
              <Bot size={22} style={{ color: meta.color }} />
            </div>
            <p className="text-sm font-medium text-[#1A1A1A]">Project Assistant</p>
            <p className="text-xs text-[#B0ADA9] mt-1">Ask about tasks, decisions, research, or anything project-related.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5" style={{ background: `${meta.color}20` }}>
                <Bot size={13} style={{ color: meta.color }} />
              </div>
            )}
            <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
              m.role === "user" ? "text-white rounded-br-sm" : "bg-white border border-[#E5E2DE] text-[#1A1A1A] rounded-bl-sm"
            }`} style={m.role === "user" ? { background: meta.color } : {}}>
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-[#E5E2DE] shrink-0 flex items-center justify-center mt-0.5">
                <User size={13} className="text-[#737373]" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: `${meta.color}20` }}>
              <Bot size={13} style={{ color: meta.color }} />
            </div>
            <div className="bg-white border border-[#E5E2DE] rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex gap-1">
                {[0,120,240].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: meta.color, animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 px-6 py-4 bg-white border-t border-[#E5E2DE]">
        <div className="flex gap-3 max-w-[800px] mx-auto">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about this project..."
            className="flex-1 px-4 py-2.5 text-sm border border-[#E5E2DE] rounded-xl focus:outline-none bg-[#F7F5F2]" />
          <button onClick={send} disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40"
            style={{ background: meta.color }}>
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

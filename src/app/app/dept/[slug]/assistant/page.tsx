"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { supabase } from "@/lib/supabaseClient";
import { Send, Bot, User } from "lucide-react";

const DEPT_META: Record<string, { label: string; color: string }> = {
  design:      { label: "Design",      color: "#8B5CF6" },
  development: { label: "Development", color: "#3B82F6" },
  marketing:   { label: "Marketing",   color: "#10B981" },
};

export default function DeptAssistantPage() {
  const { slug } = useParams() as { slug: string };
  const { activeWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [deptId, setDeptId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const meta = DEPT_META[slug] ?? { label: slug, color: "#E8521A" };

  useEffect(() => { init(); }, [activeWorkspace, slug]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function init() {
    if (!activeWorkspace) return;
    const { data: d } = await supabase.from("departments").select("id")
      .eq("workspace_id", activeWorkspace.id).eq("slug", slug).maybeSingle();
    if (!d) return;
    setDeptId(d.id);
    const res = await fetch(`/api/dept/${slug}/assistant?deptId=${d.id}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  async function send() {
    if (!input.trim() || loading || !deptId) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    const res = await fetch(`/api/dept/${slug}/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, deptId }),
    });
    const data = await res.json();
    if (data.reply) setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    setLoading(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-[#0F0F0F] text-white px-6 py-4 shrink-0 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}20` }}>
          <Bot size={16} style={{ color: meta.color }} />
        </div>
        <div>
          <h1 className="text-sm font-bold">{meta.label} Assistant</h1>
          <p className="text-[10px] text-white/40">Scoped to this department · per-user history</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center select-none">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${meta.color}15` }}>
              <Bot size={24} style={{ color: meta.color }} />
            </div>
            <p className="text-sm font-semibold text-[#1A1A1A]">{meta.label} AI Assistant</p>
            <p className="text-xs text-[#B0ADA9] mt-1 max-w-[280px]">
              Ask about your projects, tasks, team updates, or any{" "}
              {meta.label.toLowerCase()} related questions.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5" style={{ background: `${meta.color}20` }}>
                <Bot size={13} style={{ color: meta.color }} />
              </div>
            )}
            <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "text-white rounded-br-sm"
                : "bg-white text-[#1A1A1A] border border-[#E5E2DE] rounded-bl-sm"
            }`}
            style={m.role === "user" ? { background: meta.color } : {}}>
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
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: meta.color, animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: meta.color, animationDelay: "120ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: meta.color, animationDelay: "240ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-6 py-4 bg-white border-t border-[#E5E2DE]">
        <div className="flex gap-3 max-w-[800px] mx-auto">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={`Ask the ${meta.label} assistant...`}
            className="flex-1 px-4 py-2.5 text-sm border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#8B5CF6] bg-[#F7F5F2]"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-40 transition-colors"
            style={{ background: meta.color }}>
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

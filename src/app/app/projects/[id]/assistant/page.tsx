'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Send, Bot, User, Plus, Trash2 } from 'lucide-react';

type Message = { id?: string; role: 'user' | 'assistant'; content: string; created_at?: string };

export default function ProjectAssistantPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [histLoading, setHistLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Load chat history for this project
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/projects/chat?projectId=${projectId}`);
      if (res.ok) {
        const d = await res.json();
        setMessages(d.messages ?? []);
      }
      setHistLoading(false);
    })();
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/projects/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: text }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error ? `Error: ${data.error}` : 'Something went wrong. Please try again.' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please check your connection and try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearHistory() {
    if (!confirm('Clear all chat history for this project?')) return;
    await fetch(`/api/projects/chat?projectId=${projectId}`, { method: 'DELETE' });
    setMessages([]);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#E5E2DE] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-[#E8521A]" />
          <span className="text-[13px] font-semibold text-[#1A1A1A]">Project Assistant</span>
          <span className="text-[11px] text-[#737373] bg-[#F7F5F2] px-2 py-0.5 rounded-full">Scoped to this project</span>
        </div>
        <button
          onClick={clearHistory}
          className="flex items-center gap-1.5 text-[12px] text-[#737373] hover:text-[#EF4444] transition-colors"
        >
          <Trash2 size={13} /> Clear history
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {histLoading && (
          <p className="text-center text-[13px] text-[#737373]">Loading…</p>
        )}

        {!histLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pt-12">
            <div className="w-12 h-12 rounded-full bg-[#FEF3ED] flex items-center justify-center">
              <Bot size={22} className="text-[#E8521A]" />
            </div>
            <p className="text-[15px] font-semibold text-[#1A1A1A]">Project Assistant</p>
            <p className="text-[13px] text-[#737373] max-w-[360px]">
              This assistant only knows about this project — its tasks, decisions, rules, and research.
              Ask it anything specific to this project.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {['Summarise project status', 'What tasks are open?', 'What decisions have been made?', 'Create 3 tasks for next sprint'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-[12px] px-3 py-1.5 rounded-full border border-[#E5E2DE] text-[#737373] hover:border-[#E8521A] hover:text-[#E8521A] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-[#FEF3ED] flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-[#E8521A]" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-[#1A1A1A] text-white rounded-br-sm'
                : 'bg-white border border-[#E5E2DE] text-[#1A1A1A] rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0 mt-0.5">
                <User size={13} className="text-white" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-full bg-[#FEF3ED] flex items-center justify-center shrink-0">
              <Bot size={14} className="text-[#E8521A]" />
            </div>
            <div className="bg-white border border-[#E5E2DE] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#E8521A] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#E8521A] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[#E8521A] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-6 pb-5 pt-3 border-t border-[#E5E2DE] bg-white">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Ask about this project… (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none text-[14px] px-4 py-2.5 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] bg-[#FAFAF9] transition-colors max-h-[120px]"
            style={{ overflowY: 'auto' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="flex items-center justify-center w-10 h-10 bg-[#E8521A] text-white rounded-xl hover:bg-[#c94415] disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

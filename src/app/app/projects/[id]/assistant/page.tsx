'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Send, Copy, RotateCcw, Trash2, Check, FileText, Download } from 'lucide-react';

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;
  const k = () => keyIdx++;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      nodes.push(<CodeBlock key={k()} code={codeLines.join('\n')} lang={lang} />);
      i++; continue;
    }
    if (line.startsWith('# '))  { nodes.push(<h1 key={k()} className="text-xl font-bold text-[#1A1A1A] mt-6 mb-3 first:mt-0">{inlineRender(line.slice(2))}</h1>); i++; continue; }
    if (line.startsWith('## ')) { nodes.push(<h2 key={k()} className="text-lg font-bold text-[#1A1A1A] mt-5 mb-2 first:mt-0">{inlineRender(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('### ')){ nodes.push(<h3 key={k()} className="text-base font-semibold text-[#1A1A1A] mt-4 mb-1.5 first:mt-0">{inlineRender(line.slice(4))}</h3>); i++; continue; }
    if (line.match(/^[-*]{3,}$/)) { nodes.push(<hr key={k()} className="border-[#E5E2DE] my-4" />); i++; continue; }
    if (line.startsWith('> '))  { nodes.push(<blockquote key={k()} className="border-l-4 border-[#E8521A] pl-4 my-3 text-[#737373] italic">{inlineRender(line.slice(2))}</blockquote>); i++; continue; }
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) { items.push(lines[i].slice(2)); i++; }
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
      while (i < lines.length && lines[i].match(/^\d+\. /)) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
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
    if (line.trim() === '') { nodes.push(<div key={k()} className="h-3" />); i++; continue; }
    nodes.push(<p key={k()} className="text-[15px] text-[#1A1A1A] leading-relaxed">{inlineRender(line)}</p>);
    i++;
  }
  return nodes;
}

function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[.+?\]\(.+?\))/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-[#1A1A1A]">{part.slice(2,-2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic">{part.slice(1,-1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="font-mono text-[13px] bg-[#F0EDE9] text-[#E8521A] px-1.5 py-0.5 rounded">{part.slice(1,-1)}</code>;
    const lm = part.match(/\[(.+?)\]\((.+?)\)/);
    if (lm) return <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer" className="text-[#E8521A] underline hover:text-[#c94415]">{lm[1]}</a>;
    return part;
  });
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-4 rounded-xl overflow-hidden border border-[#2D2D2D] shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1A1A1A]">
        <span className="text-[11px] text-[#737373] font-mono uppercase tracking-wider">{lang || 'code'}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1.5 text-[11px] text-[#B0ADA9] hover:text-white transition-colors">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-[#2D2D2D] text-[#E5E2DE] text-[13px] font-mono p-5 overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Doc = { id: string; title: string; content: string };
type Message = { id?: string; role: 'user' | 'assistant'; content: string; created_at?: string; ts?: string; document?: Doc };
type MessageGroup = { role: 'user' | 'assistant'; messages: Message[] };

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let current: MessageGroup | null = null;
  messages.forEach(msg => {
    if (!current || current.role !== msg.role) { current = { role: msg.role, messages: [msg] }; groups.push(current); }
    else current.messages.push(msg);
  });
  return groups;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ProjectAssistantPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/projects/chat?projectId=${projectId}`);
      if (res.ok) { const d = await res.json(); setMessages(d.messages ?? []); }
      setHistLoading(false);
    })();
  }, [projectId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function send(overrideInput?: string) {
    const text = (overrideInput ?? input).trim();
    if (!text || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg: Message = { role: 'user', content: text, ts: new Date().toISOString() };
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
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply, ts: new Date().toISOString(), document: data.document ?? undefined }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error ? `Error: ${data.error}` : 'Something went wrong. Please try again.', ts: new Date().toISOString() }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please check your connection.', ts: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    if (messages.length < 2) return;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    setMessages(prev => prev.slice(0, -1));
    await send(lastUser.content);
  }

  async function clearHistory() {
    if (!confirm('Clear all chat history for this project?')) return;
    await fetch(`/api/projects/chat?projectId=${projectId}`, { method: 'DELETE' });
    setMessages([]);
  }

  function copyMessage(content: string, id: string) {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  const messageGroups = groupMessages(messages);

  const suggestions = [
    'Summarise project status',
    'What tasks are open?',
    'What decisions have been made?',
    'Write a project brief',
    'Show recent commits',
    'Create 3 tasks for next sprint',
  ];

  return (
    <div className="flex flex-col h-full bg-[#FAFAF8]">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-[#E5E2DE] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0F0F0F] flex items-center justify-center text-[14px]">🤖</div>
          <span className="text-[14px] font-semibold text-[#1A1A1A]">Project Assistant</span>
          <span className="text-[11px] text-[#737373] bg-[#F7F5F2] px-2 py-0.5 rounded-full border border-[#E5E2DE]">Scoped to this project</span>
        </div>
        <button onClick={clearHistory}
          className="flex items-center gap-1.5 text-[12px] text-[#737373] hover:text-[#EF4444] transition-colors px-2 py-1 rounded-lg hover:bg-[#FEF2F2]">
          <Trash2 size={13} /> Clear history
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[800px] mx-auto">

          {/* Empty state */}
          {!histLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#E8521A] to-[#c94415] flex items-center justify-center mb-5 shadow-lg">
                <span className="text-2xl">🤖</span>
              </div>
              <h2 className="text-[18px] font-bold text-[#1A1A1A] mb-2">Project Assistant</h2>
              <p className="text-[14px] text-[#737373] mb-8 max-w-[380px]">
                Scoped to this project — asks about tasks, decisions, rules, research, and your connected GitHub & Supabase.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-[560px]">
                {suggestions.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left text-[13px] text-[#737373] bg-white border border-[#E5E2DE] rounded-xl px-4 py-4 hover:border-[#E8521A] hover:text-[#1A1A1A] hover:shadow-sm transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {histLoading && (
            <p className="text-center text-[13px] text-[#737373] py-12">Loading history…</p>
          )}

          {/* Message groups */}
          {messageGroups.map((group, gIdx) => (
            <div key={gIdx} className="mb-8">
              <div className="flex gap-4 items-start">
                {group.role === 'assistant'
                  ? <div className="w-8 h-8 rounded-full bg-[#0F0F0F] flex items-center justify-center text-[15px] shrink-0">🤖</div>
                  : <div className="w-8 h-8 rounded-full bg-[#E8521A] flex items-center justify-center text-white text-[12px] font-bold shrink-0">Y</div>
                }
                <div className="flex-1 space-y-4">
                  {group.messages.map((msg, mIdx) => {
                    const msgId = `${gIdx}-${mIdx}`;
                    const isLast = gIdx === messageGroups.length - 1 && mIdx === group.messages.length - 1;
                    return (
                      <div key={mIdx}
                        onMouseEnter={() => setHoveredId(msgId)}
                        onMouseLeave={() => setHoveredId(null)}
                        className="group">
                        <div className={`rounded-2xl px-5 py-4 ${
                          group.role === 'assistant'
                            ? 'bg-white border border-[#E5E2DE]'
                            : 'bg-[#F0EDE9]'
                        }`}>
                          {group.role === 'user'
                            ? <p className="text-[15px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            : <div className="prose-sm">{renderMarkdown(msg.content)}</div>
                          }
                          {/* Document card */}
                          {msg.document && (
                            <div className="mt-4 pt-4 border-t border-[#E5E2DE] rounded-xl bg-[#FAFAF9] p-3 flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#FEF3ED] flex items-center justify-center shrink-0">
                                <FileText size={15} className="text-[#E8521A]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">{msg.document.title}</p>
                                <p className="text-[11px] text-[#737373] mt-0.5 line-clamp-2">{msg.document.content.slice(0, 120)}…</p>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button onClick={() => router.push(`/app/projects/${projectId}/documents`)}
                                  className="text-[11px] px-2.5 py-1 bg-[#FEF3ED] text-[#E8521A] rounded-lg hover:bg-[#FDBA9A] transition-colors font-semibold">
                                  View →
                                </button>
                                <button onClick={() => {
                                  const blob = new Blob([`# ${msg.document!.title}\n\n${msg.document!.content}`], { type: 'text/markdown' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url; a.download = `${msg.document!.title.replace(/\s+/g,'-').toLowerCase()}.md`;
                                  a.click(); URL.revokeObjectURL(url);
                                }} className="text-[11px] px-2.5 py-1 bg-[#F7F5F2] text-[#737373] rounded-lg hover:bg-[#E5E2DE] transition-colors font-semibold flex items-center gap-1">
                                  <Download size={10} /> .md
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Hover actions */}
                        <div className={`flex items-center gap-3 mt-2 transition-opacity ${hoveredId === msgId ? 'opacity-100' : 'opacity-0'}`}>
                          {msg.ts && (
                            <span className="text-[11px] text-[#B0ADA9]">
                              {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          <button onClick={() => copyMessage(msg.content, msgId)}
                            className="flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors">
                            {copiedId === msgId ? <Check size={12} /> : <Copy size={12} />}
                            {copiedId === msgId ? 'Copied' : 'Copy'}
                          </button>
                          {group.role === 'assistant' && isLast && (
                            <button onClick={regenerate} disabled={loading}
                              className="flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-[#1A1A1A] transition-colors disabled:opacity-40">
                              <RotateCcw size={12} /> Regenerate
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Loading dots */}
          {loading && (
            <div className="flex gap-4 items-start mb-8">
              <div className="w-8 h-8 rounded-full bg-[#0F0F0F] flex items-center justify-center text-[15px] shrink-0">🤖</div>
              <div className="bg-white border border-[#E5E2DE] rounded-2xl px-5 py-4">
                <div className="flex gap-1.5 items-center h-6">
                  {[0,1,2].map(i => (
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
          <div className="flex gap-2 items-end bg-[#FAFAF9] border border-[#E5E2DE] rounded-2xl px-4 py-3 focus-within:border-[#E8521A] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Ask about this project… (Enter to send, Shift+Enter for newline)"
              className="flex-1 resize-none text-[14px] text-[#1A1A1A] bg-transparent focus:outline-none leading-relaxed max-h-[120px] placeholder:text-[#B0ADA9]"
              style={{ overflowY: 'auto' }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-9 h-9 bg-[#E8521A] text-white rounded-xl hover:bg-[#c94415] disabled:opacity-40 transition-colors shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

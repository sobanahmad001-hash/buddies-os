'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Send, Copy, RotateCcw, Trash2, Check, Plus,
  FileText, Download, AlertCircle
} from 'lucide-react';
import VoiceInputButton from '@/components/VoiceInputButton';
import FileUpload from '@/components/FileUpload';

// ── Action Block Parser ───────────────────────────────────────────────────────
interface BuddiesAction {
  type: string;
  description: string;
  warning?: string;
  params: Record<string, any>;
}

interface ActionExecutionResponse {
  ok: boolean;
  status: "executed" | "failed";
  type: string;
  entity_type?: "task" | "decision" | "rule" | "research" | "document" | "update";
  entity_id?: string | null;
  message: string;
  data?: any;
}

const ACTION_OPEN = '[BUDDIES_ACTION]';
const ACTION_CLOSE = '[/BUDDIES_ACTION]';

function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  return null;
}

function parseActionPayload(raw: string): BuddiesAction | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (!parsed?.type || !parsed?.params) return null;
    return parsed as BuddiesAction;
  } catch {
    const candidate = extractFirstJsonObject(text);
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed?.type || !parsed?.params) return null;
      return parsed as BuddiesAction;
    } catch {
      return null;
    }
  }
}

function stripAllActionBlocks(content: string): string {
  let result = content;
  while (true) {
    const start = result.indexOf(ACTION_OPEN);
    if (start === -1) break;
    const close = result.indexOf(ACTION_CLOSE, start + ACTION_OPEN.length);
    if (close === -1) {
      result = result.slice(0, start);
      break;
    }
    result = result.slice(0, start) + result.slice(close + ACTION_CLOSE.length);
  }
  return result;
}

function extractActionBlock(content: string): { action: BuddiesAction | null; cleanContent: string } {
  const start = content.indexOf(ACTION_OPEN);
  if (start === -1) return { action: null, cleanContent: content };

  const afterOpen = content.slice(start + ACTION_OPEN.length);
  const close = afterOpen.indexOf(ACTION_CLOSE);
  const payload = close === -1 ? afterOpen : afterOpen.slice(0, close);
  const action = parseActionPayload(payload);

  return {
    action,
    cleanContent: stripAllActionBlocks(content).trim(),
  };
}

// ── Action Block Component ────────────────────────────────────────────────────
function ActionBlock({ action, projectId, sessionId, onExecuted }: { action: BuddiesAction; projectId: string; sessionId?: string | null; onExecuted?: (result: ActionExecutionResponse) => void }) {
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (executing || executed || declined) return;
    setExecuting(true);
    setError(null);
    
    try {
      const res = await fetch('/api/projects/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId: sessionId ?? null }),
      });
      
      const data: ActionExecutionResponse = await res.json();
      if (!res.ok || !data?.ok) throw new Error((data as any).error || data?.message || 'Action failed');
      
      setExecuted(true);
      setSuccess(true);
      onExecuted?.(data);
      // Keep success state permanently — resetting caused pointer-event blocking on adjacent cards
    } catch (err: any) {
      setError(err.message || 'Failed to execute action');
    } finally {
      setExecuting(false);
    }
  }

  if (declined) {
    return (
      <div className="bg-[#F7F5F2] border border-[#E5E2DE] rounded-xl p-4 mt-4 flex items-center gap-3">
        <AlertCircle size={18} className="text-[#737373] shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-[#404040]">Action Declined</p>
          <p className="text-[12px] text-[#737373] mt-0.5">No changes were made.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-[#DCFCE7] border border-[#86EFAC] rounded-lg">
        <Check size={13} className="text-[#16A34A] shrink-0" />
        <p className="text-[12px] font-semibold text-[#166534]">{action.description}</p>
      </div>
    );
  }

  return (
    <div className="bg-[#FAF0E8] border border-[#DEB48A] rounded-xl p-4 mt-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertCircle size={18} className="text-[#B5622A] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#1A1A1A]">{action.description}</p>
          <p className="text-[11px] text-[#737373] mt-1">Proposed action</p>
          {action.warning && (
            <p className="text-[12px] text-[#9A4E20] mt-1.5 leading-relaxed">{action.warning}</p>
          )}
          <details className="mt-2.5 text-[11px]">
            <summary className="cursor-pointer text-[#737373] hover:text-[#1A1A1A] transition-colors">
              View action details
            </summary>
            <pre className="mt-2 bg-[#1A1A1A] text-[#E5E2DE] text-[10px] p-2 rounded overflow-x-auto">
              {JSON.stringify(action, null, 2)}
            </pre>
          </details>
        </div>
      </div>
      {error && (
        <p className="text-[12px] text-[#EF4444] mb-3 bg-[#FEE2E2] px-3 py-2 rounded-lg">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={approve}
          disabled={executing || executed || declined}
          className="flex-1 bg-[#B5622A] text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:bg-[#9A4E20] disabled:opacity-50 transition-colors"
        >
          {executing ? 'Executing…' : 'Approve & Execute'}
        </button>
        <button
          onClick={() => setDeclined(true)}
          disabled={executing || executed || declined}
          className="px-4 py-2 bg-white text-[#737373] text-[13px] font-semibold rounded-lg border border-[#E5E2DE] hover:text-[#1A1A1A] disabled:opacity-50 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

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
    if (line.startsWith('> '))  { nodes.push(<blockquote key={k()} className="border-l-4 border-[#B5622A] pl-4 my-3 text-[#737373] italic">{inlineRender(line.slice(2))}</blockquote>); i++; continue; }
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) { items.push(lines[i].slice(2)); i++; }
      nodes.push(
        <ul key={k()} className="list-none my-3 space-y-2 pl-1">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 text-[15px] text-[#1A1A1A]">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#B5622A] shrink-0" />
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
              <span className="shrink-0 w-5 h-5 rounded-full bg-[#F0EDE9] text-[#B5622A] text-[11px] font-bold flex items-center justify-center">{j + 1}</span>
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
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="font-mono text-[13px] bg-[#F0EDE9] text-[#B5622A] px-1.5 py-0.5 rounded">{part.slice(1,-1)}</code>;
    const lm = part.match(/\[(.+?)\]\((.+?)\)/);
    if (lm) return <a key={i} href={lm[2]} target="_blank" rel="noopener noreferrer" className="text-[#B5622A] underline hover:text-[#9A4E20]">{lm[1]}</a>;
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
type Message = { id?: string; role: 'user' | 'assistant'; content: string; created_at?: string; ts?: string; document?: Doc; images?: string[] };
type MessageGroup = { role: 'user' | 'assistant'; messages: Message[] };
type ProjectSession = { id: string; title: string; created_at: string; updated_at?: string };

type ApiResponse = {
  ok?: boolean;
  reply?: string;
  error?: string;
  sessionId?: string;
  document?: any;
  [key: string]: any;
};

type ExtractedReply = {
  status: 'success' | 'error' | 'empty' | 'action_only';
  content: string;
  hasAction: boolean;
  document?: any;
};

/**
 * Safely extract assistant reply from API response.
 * Handles all failure modes to prevent blank bubbles.
 */
function extractAssistantReply(res: Response, data: ApiResponse): ExtractedReply {
  // Check HTTP status first
  if (!res.ok) {
    const errorMsg = data?.error || `Server error: ${res.status}`;
    return {
      status: 'error',
      content: `⚠️ Request failed: ${errorMsg}`,
      hasAction: false,
    };
  }

  // Extract reply and check if it has content
  const reply = (data?.reply || '').trim();
  
  // Check if there is an action block
  const { action: hasActionBlock } = extractActionBlock(reply);
  const plainText = stripAllActionBlocks(reply).trim();

  // Case 1: Has plain text (normal reply or text + action)
  if (plainText) {
    return {
      status: 'success',
      content: reply,
      hasAction: Boolean(hasActionBlock),
      document: data?.document,
    };
  }

  // Case 2: Only action block, no plain text
  if (hasActionBlock) {
    return {
      status: 'action_only',
      content: reply, // Still return full reply with action block
      hasAction: true,
      document: data?.document,
    };
  }

  // Case 3: Empty or whitespace only
  return {
    status: 'empty',
    content: '⚠️ Empty response from assistant',
    hasAction: false,
  };
}



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

  const getDefaultModelForProvider = (p: 'anthropic' | 'openai' | 'xai') =>
    p === 'anthropic' ? 'claude-sonnet-4-5' : p === 'openai' ? 'gpt-4.1' : 'grok-3';

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ProjectSession[]>([]);
  const [activeSession, setActiveSession] = useState<ProjectSession | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'xai'>('openai');
  const [model, setModel] = useState('gpt-4.1');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const providerModels: Record<'anthropic' | 'openai' | 'xai', { label: string; value: string }[]> = {
    anthropic: [
      { label: 'Claude Sonnet', value: 'claude-sonnet-4-5' },
      { label: 'Claude Haiku', value: 'claude-haiku-4-5-20251001' },
    ],
    openai: [
      { label: 'GPT-4.1',      value: 'gpt-4.1' },
      { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' },
    ],
    xai: [
      { label: 'Grok 3', value: 'grok-3' },
      { label: 'Grok 3 Mini', value: 'grok-3-mini' },
    ],
  };

  useEffect(() => {
    const savedProvider = localStorage.getItem('buddies-ai-provider') as 'anthropic' | 'openai' | 'xai' | null;
    const savedModel = localStorage.getItem('buddies-ai-model');
    const nextProvider = savedProvider ?? 'anthropic';
    const allowedModels = providerModels[nextProvider].map((m) => m.value);
    const fallbackModel = getDefaultModelForProvider(nextProvider);
    const nextModel = savedModel && allowedModels.includes(savedModel) ? savedModel : fallbackModel;

    setProvider(nextProvider);
    setModel(nextModel);

    if (savedProvider !== nextProvider) {
      localStorage.setItem('buddies-ai-provider', nextProvider);
    }
    if (savedModel !== nextModel) {
      localStorage.setItem('buddies-ai-model', nextModel);
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      bootstrapProjectChats();
    }
  }, [projectId]);

  async function bootstrapProjectChats() {
    if (!projectId) return;
    const loadedSessions = await loadSessions();
    if (loadedSessions.length > 0) {
      await openSession(loadedSessions[0]);
    } else {
      setActiveSession(null);
      setMessages([]);
      setHistLoading(false);
    }
  }

  async function loadSessions() {
    if (!projectId) return [] as ProjectSession[];
    const res = await fetch(`/api/projects/chat/sessions?projectId=${projectId}`);
    if (!res.ok) {
      setSessions([]);
      return [] as ProjectSession[];
    }
    const data = await res.json();
    const loaded = (data.sessions ?? []) as ProjectSession[];
    setSessions(loaded);
    return loaded;
  }

  async function openSession(session: ProjectSession) {
    if (!projectId) return;
    setActiveSession(session);
    await loadHistory(session.id);
  }

  function startNewChat() {
    setActiveSession(null);
    setMessages([]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function loadHistory(sessionId?: string) {
    if (!projectId) return;
    const q = sessionId ? `&sessionId=${sessionId}` : '';
    const res = await fetch(`/api/projects/chat?projectId=${projectId}${q}`);
    if (res.ok) {
      const d = await res.json();
      setMessages((d.messages ?? []).map((m: any) => ({
        ...m,
        ts: m.created_at ?? m.ts,
      })));
    }
    setHistLoading(false);
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // Screenshot paste handler — mirrors main AI page
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) setAttachedFiles(prev => [...prev, file]);
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  function handleVoiceTranscript(transcript: string) {
    setInput(transcript);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function send(overrideInput?: string) {
    if (!projectId) {
      console.warn('projectId not yet available');
      return;
    }
    const text = (overrideInput ?? input).trim();
    if ((!text && attachedFiles.length === 0) || loading) return;

    const imageUrls: string[] = [];
    const fileContextBlocks: string[] = [];

    if (attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch('/api/ai/upload', { method: 'POST', body: formData });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            if (uploadData.url && file.type.startsWith('image/')) {
              imageUrls.push(uploadData.url);
            }
            if (uploadData.summary && !file.type.startsWith('image/')) {
              const block = uploadData.isZip
                ? `📦 ZIP: **${file.name}** (${uploadData.fileCount ?? "?"} files)\nKey files: ${(uploadData.keyFiles ?? []).slice(0, 8).join(", ")}\nSummary: ${uploadData.summary}`
                : `📄 File: **${file.name}**\nSummary: ${uploadData.summary}`;
              fileContextBlocks.push(block);
            }
          }
        } catch {}
      }
      setAttachedFiles([]);
    }

    const combinedText = [text, ...fileContextBlocks].filter(Boolean).join('\n\n');
    const requestMessage = combinedText || (imageUrls.length > 0 ? 'Please analyze the attached image(s).' : '');
    const allowedModels = providerModels[provider].map((m) => m.value);
    const safeModel = allowedModels.includes(model) ? model : getDefaultModelForProvider(provider);

    const userMsg: Message = {
      role: 'user',
      content: requestMessage || `📎 ${attachedFiles.length} file${attachedFiles.length > 1 ? 's' : ''} attached`,
      ts: new Date().toISOString(),
      images: imageUrls.length > 0 ? imageUrls : undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const res = await fetch('/api/projects/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          sessionId: activeSession?.id ?? null,
          message: requestMessage,
          images: imageUrls.length > 0 ? imageUrls : undefined,
          provider,
          model: safeModel,
        }),
      });
      const data = await res.json();

      // Use helper to safely extract reply and categorize response
      const extracted = extractAssistantReply(res, data);

      // Update session if new — must fire for ALL non-error statuses, including
      // 'action_only' (pure action block with no text), otherwise the returned
      // sessionId is never stored and every subsequent message loses context.
      if (!activeSession && data.sessionId) {
        const newSession: ProjectSession = {
          id: data.sessionId,
          title: requestMessage.slice(0, 60) || 'New chat',
          created_at: new Date().toISOString(),
        };
        setActiveSession(newSession);
        loadSessions(); // refresh session list in the background
      }

      // Add assistant message with proper categorization
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: extracted.content,
        ts: new Date().toISOString(),
        document: extracted.document,
      }]);
    } catch (err: any) {
      const errorMsg = err?.message || 'Network error. Please check your connection.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ ${errorMsg}`,
        ts: new Date().toISOString(),
      }]);
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
    if (!projectId || !activeSession) return;
    if (!confirm('Delete this chat?')) return;
    await fetch(`/api/projects/chat/sessions?projectId=${projectId}&id=${activeSession.id}`, { method: 'DELETE' });
    const loadedSessions = await loadSessions();
    if (loadedSessions.length > 0) {
      await openSession(loadedSessions[0]);
    } else {
      startNewChat();
    }
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
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
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
      <div className="flex flex-col gap-2 px-3 sm:px-5 py-3 bg-white border-b border-[#E5E2DE] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#0F0F0F] flex items-center justify-center text-[14px]">🤖</div>
          <span className="text-[14px] font-semibold text-[#1A1A1A] truncate">Project Assistant</span>
          <span className="hidden sm:inline-flex text-[11px] text-[#737373] bg-[#F7F5F2] px-2 py-0.5 rounded-full border border-[#E5E2DE]">Scoped to this project</span>
          <span className="hidden sm:inline-flex text-[11px] text-[#737373] bg-[#F7F5F2] px-2 py-0.5 rounded-full border border-[#E5E2DE]">{provider} · {model || 'default'}</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value as 'anthropic' | 'openai' | 'xai';
              setProvider(next);
              localStorage.setItem('buddies-ai-provider', next);
              const defaultModel =
                next === 'anthropic' ? 'claude-sonnet-4-5' :
                next === 'openai' ? 'gpt-4o' :
                'grok-3';
              setModel(defaultModel);
              localStorage.setItem('buddies-ai-model', defaultModel);
            }}
            className="shrink-0 text-[12px] px-2 py-1.5 rounded-lg border border-[#E5E2DE] bg-white text-[#1A1A1A]"
          >
            <option value="anthropic">Claude</option>
            <option value="openai">OpenAI</option>
            <option value="xai">Grok</option>
          </select>

          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              localStorage.setItem('buddies-ai-model', e.target.value);
            }}
            className="shrink-0 text-[12px] px-2 py-1.5 rounded-lg border border-[#E5E2DE] bg-white text-[#1A1A1A]"
          >
            {providerModels[provider].map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <button onClick={clearHistory}
          disabled={!activeSession}

          className="shrink-0 flex items-center gap-1.5 text-[12px] text-[#737373] hover:text-[#EF4444] transition-colors px-2 py-1 rounded-lg hover:bg-[#FEF2F2] disabled:opacity-40">
          <Trash2 size={13} /> <span className="hidden sm:inline">Clear history</span>
        </button>
        </div>
      </div>

      {/* Chat submenu */}
      <div className="px-3 sm:px-5 py-2 bg-white border-b border-[#EDE9E4] shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={startNewChat}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B5622A] text-white text-[12px] font-semibold hover:bg-[#9A4E20] transition-colors"
          >
            <Plus size={13} /> New chat
          </button>

          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => openSession(session)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] border transition-colors max-w-[220px] truncate ${
                activeSession?.id === session.id
                  ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                  : 'bg-[#F7F5F2] text-[#404040] border-[#E5E2DE] hover:bg-[#F0EDE9]'
              }`}
              title={session.title || 'Chat'}
            >
              {session.title || 'Chat'}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[800px] mx-auto">

          {/* Empty state */}
          {!histLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#B5622A] to-[#9A4E20] flex items-center justify-center mb-5 shadow-lg">
                <span className="text-2xl">🤖</span>
              </div>
              <h2 className="text-[18px] font-bold text-[#1A1A1A] mb-2">Project Assistant</h2>
              <p className="text-[14px] text-[#737373] mb-8 max-w-[380px]">
                Scoped to this project — asks about tasks, decisions, rules, research, and your connected GitHub & Supabase.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-[560px]">
                {suggestions.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-left text-[13px] text-[#737373] bg-white border border-[#E5E2DE] rounded-xl px-4 py-4 hover:border-[#B5622A] hover:text-[#1A1A1A] hover:shadow-sm transition-all">
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
                  : <div className="w-8 h-8 rounded-full bg-[#B5622A] flex items-center justify-center text-white text-[12px] font-bold shrink-0">Y</div>
                }
                <div className="flex-1 space-y-4">
                  {group.messages.map((msg, mIdx) => {
                    const msgId = `${gIdx}-${mIdx}`;
                    const isLast = gIdx === messageGroups.length - 1 && mIdx === group.messages.length - 1;
                    // Extract ALL action blocks from this message
                    const allActionBlocks: BuddiesAction[] = [];
                    let cleanContent = msg.content;
                    if (group.role === 'assistant') {
                      let remaining = msg.content;
                      let safetyCount = 0;
                      while (remaining.includes(ACTION_OPEN) && safetyCount < 10) {
                        const { action: extracted, cleanContent: afterExtract } = extractActionBlock(remaining);
                        if (extracted) { allActionBlocks.push(extracted); remaining = afterExtract; }
                        else break;
                        safetyCount++;
                      }
                      cleanContent = remaining.trim();
                    }
                    const action = allActionBlocks[0] ?? null;
                    
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
                            ? (
                              <div>
                                <p className="text-[15px] text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                {msg.images && msg.images.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    {msg.images.map((url, ii) => (
                                      <img
                                        key={ii}
                                        src={url}
                                        alt="attachment"
                                        className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-[#E5E2DE]"
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                            : <div className="prose-sm">{renderMarkdown(cleanContent)}</div>
                          }
                          {/* Document card */}
                          {msg.document && (
                            <div className="mt-4 pt-4 border-t border-[#E5E2DE] rounded-xl bg-[#FAFAF9] p-3 flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#FAF0E8] flex items-center justify-center shrink-0">
                                <FileText size={15} className="text-[#B5622A]" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">{msg.document.title}</p>
                                <p className="text-[11px] text-[#737373] mt-0.5 line-clamp-2">{msg.document.content.slice(0, 120)}…</p>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button onClick={() => router.push(`/app/projects/${projectId}/documents`)}
                                  className="text-[11px] px-2.5 py-1 bg-[#FAF0E8] text-[#B5622A] rounded-lg hover:bg-[#DEB48A] transition-colors font-semibold">
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
                          {/* All action blocks — rendered independently */}
                          {allActionBlocks.map((act, actIdx) => (
                            <ActionBlock
                              key={`${act.type}-${actIdx}-${JSON.stringify(act.params).slice(0, 40)}`}
                              action={act}
                              projectId={projectId}
                              sessionId={activeSession?.id ?? null}
                              onExecuted={async () => {
                                loadSessions();
                                setTimeout(async () => {
                                  const q = activeSession?.id ? `&sessionId=${activeSession.id}` : '';
                                  const historyRes = await fetch(`/api/projects/chat?projectId=${projectId}${q}`);
                                  if (historyRes.ok) {
                                    const historyData = await historyRes.json();
                                    setMessages(historyData.messages ?? []);
                                  }
                                }, 5000);
                              }}
                            />
                          ))}
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
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#F0EDE9] rounded-lg text-[12px] text-[#737373]">
                  {file.type.startsWith('image/') ? '🖼️' : (file.name.endsWith('.zip') ? '📦' : '📄')} {file.name.slice(0, 20)}{file.name.length > 20 ? '…' : ''}
                  <button
                    onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}
                    className="ml-0.5 hover:text-[#B5622A] transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-[#FAFAF9] border border-[#E5E2DE] rounded-2xl px-4 py-3 focus-within:border-[#B5622A] transition-colors">
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <VoiceInputButton onTranscript={handleVoiceTranscript} />
              <FileUpload onFilesSelected={(files) => setAttachedFiles(prev => [...prev, ...files])} />
            </div>
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKey}
                rows={2}
                placeholder="Ask about this project… (Enter to send, Shift+Enter for newline)"
                className="flex-1 resize-none text-[15px] text-[#1A1A1A] bg-transparent focus:outline-none leading-relaxed placeholder:text-[#B0ADA9]"
                style={{ overflowY: 'auto', minHeight: '56px', maxHeight: '180px' }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !projectId || (!input.trim() && attachedFiles.length === 0)}
                className="flex items-center justify-center w-10 h-10 bg-[#B5622A] text-white rounded-xl hover:bg-[#9A4E20] disabled:opacity-40 transition-colors shrink-0"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

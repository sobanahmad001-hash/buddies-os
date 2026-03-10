"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Send, Loader2, Sparkles, Check, X, CheckCheck,
  FolderKanban, Scale, ShieldCheck, AlertTriangle,
  Sun, ChevronDown, History, Plus, Pencil, Paperclip,
  FileText, FolderPlus, Folder
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; status: string };
type Message = { role: "user" | "assistant"; content: string; filename?: string };
type ActionData = { action: string; name: string; description?: string; message: string };
type ExtractedItem = {
  id: string;
  type: "project_update" | "decision" | "rule" | "blocker" | "daily_check";
  project?: string; assignedProjectId?: string | null;
  content: string; update_type?: string; next_actions?: string;
  verdict?: string; probability?: number; rule_text?: string; severity?: number;
  context?: string; mood?: string; sleep_hours?: number; stress?: number; notes?: string;
  status: "pending" | "saved" | "dismissed";
};
type ThreadEntry = {
  message: Message;
  extractions?: ExtractedItem[];
  newProjects?: string[];
  action?: ActionData;
  actionStatus?: "pending" | "created" | "dismissed";
};
type Session = { id: string; title: string; updated_at: string };

const STARTERS = [
  "/report",
  "/state",
  "Should I make a big decision today?",
  "What patterns exist in my behavior?",
];

// /check shortcut expands to morning check-in
function expandShortcut(text: string): string {
  const t = text.trim().toLowerCase();
  if (t === "/check") return "Morning check-in: log my sleep, mood, stress, confidence, and impulse for today";
  if (t === "/week") return "Give me a summary of what happened across all projects this week";
  if (t === "/decisions") return "Show me all open decisions that need review";
  if (t === "/focus") return "Based on my projects and behavior patterns, what should I focus on today?";
  if (t === "/insights") return "Run the insight generation engine and tell me the strongest patterns you find in my data";
  if (t === "/embed") return "Generate embeddings for my existing decisions and lessons so semantic search works";
  if (t === "/report") return "Generate my weekly intelligence report: decisions made, success rate, best operating state, risk patterns, and what to focus on this week";
  if (t === "/state") return "What is my current cognitive state and should I be making important decisions right now?";
  return text;
}

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
    t.startsWith("summarize") || t.startsWith("show ") ||
    t.startsWith("give me") || t.startsWith("tell me") || t.length < 25;
}

function extractProjectName(text: string): string | null {
  const t = text.trim();
  const lower = t.toLowerCase();

  // Only trigger if message is PRIMARILY about creating a project
  // If message also contains "add updates" or "add decisions", don't intercept
  const hasUpdates = lower.includes("add update") || lower.includes("add these") || lower.includes("add decision") || lower.includes("add pending") || lower.includes("updates in") || lower.includes("and add");
  
  const patterns = [
    /(?:add|create|set up|setup)\s+["']?([A-Za-z0-9 _\-]+?)["']?\s+as\s+(?:a\s+)?(?:new\s+)?project/i,
    /(?:add|create)\s+(?:a\s+)?(?:new\s+)?project\s+(?:called|named|for)?\s+["']?([A-Za-z0-9 _\-]+?)["']?\s*$/i,
    /(?:can you\s+)?(?:add|create)\s+["']?([A-Za-z0-9 _\-]+?)["']?\s+(?:as a project|as new project)\s*$/i,
    /(?:add|create)\s+["']([^"']+)["']\s+(?:as a project|project)\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match && match[1] && match[1].trim().length > 1 && !hasUpdates) {
      return match[1].trim();
    }
  }

  // Simple "add X for me" only if no update context
  if (!hasUpdates && lower.includes("for me") && (lower.startsWith("add ") || lower.startsWith("create ")) && t.split(" ").length <= 6) {
    const words = t.split(" ");
    const forIdx = words.findIndex(w => w.toLowerCase() === "for");
    if (forIdx > 1) {
      return words.slice(1, forIdx).join(" ").trim();
    }
  }

  return null;
}

function isProjectRequest(text: string): boolean {
  return extractProjectName(text) !== null;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Project selector dropdown
function ProjectSelector({ item, projects, onChange }: {
  item: ExtractedItem; projects: Project[];
  onChange: (id: string | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const matched = projects.find(p => p.id === item.assignedProjectId);
  const label = matched?.name ?? item.project ?? "No project";

  async function createAndAssign() {
    if (!newName.trim()) return;
    const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
    const data = await res.json();
    if (data.project) { onChange(data.project.id, data.project.name); setOpen(false); setCreating(false); setNewName(""); }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-[#737373] hover:text-[#CC785C] border border-[#E5E2DE] rounded-md px-1.5 py-0.5 hover:border-[#CC785C] transition-colors">
        <Folder size={9} /><span className="max-w-[80px] truncate">{label}</span><ChevronDown size={8} />
      </button>
      {open && (
        <div className="absolute top-6 left-0 w-52 bg-white border border-[#E5E2DE] rounded-xl shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#F7F5F2]">
            <p className="text-[10px] font-semibold text-[#737373] uppercase tracking-wide">Assign to project</p>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <button onClick={() => { onChange(null, null); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[12px] text-[#737373] hover:bg-[#FAF9F7]">No project</button>
            {projects.map(p => (
              <button key={p.id} onClick={() => { onChange(p.id, p.name); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#FAF9F7] flex items-center justify-between ${item.assignedProjectId === p.id ? "text-[#CC785C] font-semibold" : "text-[#404040]"}`}>
                {p.name}{item.assignedProjectId === p.id && <Check size={11} className="text-[#CC785C]" />}
              </button>
            ))}
          </div>
          <div className="border-t border-[#F7F5F2] p-2">
            {creating ? (
              <div className="flex gap-1">
                <input className="flex-1 text-[11px] border border-[#E5E2DE] rounded px-2 py-1 outline-none focus:border-[#CC785C]"
                  placeholder="Project name" value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createAndAssign()} autoFocus />
                <button onClick={createAndAssign} className="text-[11px] px-2 bg-[#1A1A1A] text-white rounded">+</button>
              </div>
            ) : (
              <button onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 w-full text-[11px] text-[#CC785C] font-semibold px-1 py-1 hover:bg-[#FAF9F7] rounded">
                <FolderPlus size={11} /> Create new project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExtractionChip({ item, projects, onSave, onDismiss, onEdit, onProjectChange }: {
  item: ExtractedItem; projects: Project[];
  onSave: () => void; onDismiss: () => void;
  onEdit: (val: string) => void;
  onProjectChange: (id: string | null, name: string | null) => void;
}) {
  const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.project_update;
  const Icon = config.icon;
  const [editVal, setEditVal] = useState(item.rule_text ?? item.content);
  const [isEditing, setIsEditing] = useState(false);
  const needsProject = ["project_update", "blocker"].includes(item.type);

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
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${config.color}`}>{config.label}</span>
          {needsProject && item.status === "pending" && (
            <ProjectSelector item={item} projects={projects} onChange={onProjectChange} />
          )}
          {!needsProject && item.project && <span className="text-[10px] text-[#737373]">→ {item.project}</span>}
        </div>
        {isEditing ? (
          <div className="flex gap-1 mt-1">
            <input className="flex-1 text-[12px] border border-[#E5E2DE] rounded px-2 py-1 outline-none focus:border-[#CC785C]"
              value={editVal} onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { onEdit(editVal); setIsEditing(false); } if (e.key === "Escape") setIsEditing(false); }}
              autoFocus />
            <button onClick={() => { onEdit(editVal); setIsEditing(false); }} className="text-[11px] px-2 py-1 bg-[#1A1A1A] text-white rounded">OK</button>
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
          <button onClick={onSave} className="w-7 h-7 rounded-lg bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors">
            <Check size={12} className="text-white" />
          </button>
          <button onClick={onDismiss} className="w-7 h-7 rounded-lg border border-[#E5E2DE] flex items-center justify-center hover:border-[#EF4444] hover:text-[#EF4444] transition-colors text-[#999]">
            <X size={12} />
          </button>
        </div>
      )}
      {item.status === "saved" && <span className="text-[10px] text-[#2D6A4F] font-semibold shrink-0 mt-1">Saved ✓</span>}
    </div>
  );
}

// Action card for project creation
function ActionCard({ entry, onConfirm, onDismiss }: {
  entry: ThreadEntry;
  onConfirm: (name: string, description?: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const action = entry.action!;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(action.name);
  const [desc, setDesc] = useState(action.description ?? "");

  if (entry.actionStatus === "created") {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4]">
        <FolderKanban size={13} className="text-[#2D6A4F]" />
        <p className="text-[12px] text-[#2D6A4F] font-semibold">"{name}" created successfully ✓</p>
      </div>
    );
  }

  if (entry.actionStatus === "dismissed") return null;

  return (
    <div className="border border-[#DBEAFE] bg-[#EFF6FF] rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FolderPlus size={13} className="text-[#2C5F8A]" />
        <p className="text-[11px] font-semibold text-[#2C5F8A] uppercase tracking-wide">Create Project</p>
      </div>
      <div className="space-y-1.5">
        <input
          className="w-full text-[13px] border border-[#BFDBFE] rounded-lg px-3 py-2 outline-none focus:border-[#2C5F8A] bg-white"
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Project name" />
        <input
          className="w-full text-[12px] border border-[#BFDBFE] rounded-lg px-3 py-1.5 outline-none focus:border-[#2C5F8A] bg-white text-[#737373]"
          value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Description (optional)" />
      </div>
      <div className="flex gap-2 pt-0.5">
        <button onClick={async () => { setLoading(true); await onConfirm(name, desc || undefined); setLoading(false); }}
          disabled={!name.trim() || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-semibold rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Create project
        </button>
        <button onClick={onDismiss}
          className="px-3 py-1.5 border border-[#BFDBFE] text-[#737373] text-[12px] rounded-lg hover:border-[#999] transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AIPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const didAutoSend = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (!data.user) router.push("/login"); });
    loadSessions();
    loadProjects();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread, loading]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !didAutoSend.current) { didAutoSend.current = true; setTimeout(() => send(q), 200); }
  }, [params]);

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
  }

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
      setSessionId(id); setShowHistory(false);
    }
  }

  async function saveSession(t: ThreadEntry[], sid: string | null) {
    const messages = t.map(e => e.message);
    const res = await fetch("/api/ai/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, messages, title: messages[0]?.content?.slice(0, 60) }),
    });
    const data = await res.json();
    return data.sessionId ?? sid;
  }

  const send = useCallback(async (text?: string) => {
    const raw = (text ?? input).trim();
    const content = expandShortcut(raw);
    if (!content || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content };
    const newThread: ThreadEntry[] = [...thread, { message: userMsg }];
    setThread(newThread);
    setLoading(true);

    const isQ = isQuestion(content);
    const detectedProjectName = extractProjectName(content);
    const isProjReq = detectedProjectName !== null;

    const aiCall = fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: newThread.map(t => t.message),
        detectedProjectName: isProjReq ? detectedProjectName : undefined,
      })
    }).then(r => r.json());

    const extractCall = !isQ
      ? fetch("/api/ai/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content }) }).then(r => r.json())
      : Promise.resolve(null);

    const decisionCall = !isQ
      ? fetch("/api/ai/extract-decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content }) }).then(r => r.json()).catch(() => ({ decision_detected: false }))
      : Promise.resolve({ decision_detected: false });

    const [aiData, extractDataRaw, decisionData] = await Promise.all([aiCall, extractCall, decisionCall]);
    let extractData: any = extractDataRaw;
    setLoading(false);

    // Handle project creation action
    if (aiData.action?.action === "create_project") {
      const assistantMsg: Message = { role: "assistant", content: `Got it — confirm to create **${aiData.action.name}**:` };
      const final = [...newThread, { message: assistantMsg, action: aiData.action, actionStatus: "pending" as const }];
      setThread(final);
      const newSid = await saveSession(final, sessionId);
      if (!sessionId) setSessionId(newSid);
      loadSessions();
      return;
    }

    const assistantMsg: Message = { role: "assistant", content: aiData.text ?? "Error." };
    const items: ExtractedItem[] = (!isQ && !isProjReq ? (extractData?.items ?? []) : []).map((item: any, i: number) => {
      const matched = projects.find(p => p.name.toLowerCase() === (item.project ?? "").toLowerCase());
      return { ...item, id: `${Date.now()}-${i}`, status: "pending" as const, assignedProjectId: matched?.id ?? null };
    });

    const withAssistant = [...newThread, { message: assistantMsg }];
    const final = withAssistant.map((entry, idx) =>
      idx === newThread.length - 1 && items.length > 0 ? { ...entry, extractions: items } : entry
    );

    setThread(final);
    const newSid = await saveSession(final, sessionId);
    if (!sessionId) setSessionId(newSid);
    loadSessions();
  }, [input, loading, thread, sessionId, projects]);

  async function handleCreateProject(msgIdx: number, name: string, description?: string) {
    const res = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    if (data.project) {
      setProjects(prev => [data.project, ...prev]);
      setThread(prev => prev.map((t, i) => i !== msgIdx ? t : { ...t, actionStatus: "created" as const }));
    }
  }

  function handleDismissAction(msgIdx: number) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : { ...t, actionStatus: "dismissed" as const }));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/ai/upload", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.error) { alert(`Upload failed: ${data.error}`); return; }

    const userMsg: Message = { role: "user", content: `📄 Uploaded: ${file.name}`, filename: file.name };
    const extracted = data.extracted ?? {};
    let aiContent = `**${file.name}**\n\n${data.summary ?? "File processed."}`;
    if (extracted.updates?.length) aiContent += `\n\n**Updates:**\n${extracted.updates.map((u: string) => `- ${u}`).join("\n")}`;
    if (extracted.decisions?.length) aiContent += `\n\n**Decisions needed:**\n${extracted.decisions.map((d: string) => `- ${d}`).join("\n")}`;
    if (extracted.actions?.length) aiContent += `\n\n**Actions:**\n${extracted.actions.map((a: string) => `- ${a}`).join("\n")}`;
    if (extracted.blockers?.length) aiContent += `\n\n**Blockers:**\n${extracted.blockers.map((b: string) => `- ${b}`).join("\n")}`;

    const assistantMsg: Message = { role: "assistant", content: aiContent };
    const items: ExtractedItem[] = [
      ...(extracted.updates ?? []).map((u: string, i: number) => ({ id: `fu-${i}`, type: "project_update" as const, project: extracted.project, assignedProjectId: null, content: u, status: "pending" as const })),
      ...(extracted.decisions ?? []).map((d: string, i: number) => ({ id: `fd-${i}`, type: "decision" as const, content: d, context: d, status: "pending" as const })),
      ...(extracted.blockers ?? []).map((b: string, i: number) => ({ id: `fb-${i}`, type: "blocker" as const, project: extracted.project, assignedProjectId: null, content: b, status: "pending" as const })),
    ];

    const newThread = [...thread,
      { message: userMsg, extractions: items.length > 0 ? items : undefined },
      { message: assistantMsg }
    ];
    setThread(newThread);
    const newSid = await saveSession(newThread, sessionId);
    if (!sessionId) setSessionId(newSid);
    loadSessions();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSave(msgIdx: number, itemId: string) {
    const item = thread[msgIdx]?.extractions?.find(e => e.id === itemId);
    if (!item) return;
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : { ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, status: "saved" as const } : e) }));
    const res = await fetch("/api/ai/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
    const data = await res.json();
    // Trigger project memory update in background after save
    if (data.triggerMemory && data.projectId) {
      fetch("/api/ai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: data.projectId }) }).catch(() => {});
      loadProjects(); // refresh project list to get updated memory
    }
  }

  function handleDismiss(msgIdx: number, itemId: string) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : { ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, status: "dismissed" as const } : e) }));
  }

  function handleEdit(msgIdx: number, itemId: string, val: string) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : { ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, content: val, rule_text: e.rule_text ? val : e.rule_text } : e) }));
  }

  function handleProjectChange(msgIdx: number, itemId: string, projectId: string | null, projectName: string | null) {
    setThread(prev => prev.map((t, i) => i !== msgIdx ? t : { ...t, extractions: t.extractions?.map(e => e.id === itemId ? { ...e, assignedProjectId: projectId, project: projectName ?? e.project } : e) }));
  }

  async function handleSaveAll() {
    for (let msgIdx = 0; msgIdx < thread.length; msgIdx++) {
      for (const item of thread[msgIdx].extractions?.filter(e => e.status === "pending") ?? []) {
        await handleSave(msgIdx, item.id);
      }
    }
  }

  const pendingCount = thread.reduce((acc, t) => acc + (t.extractions?.filter(e => e.status === "pending").length ?? 0), 0);

  return (
    <div className="flex flex-col bg-[#FAF9F7]" style={{ height: "100vh" }}>
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 pb-3 shrink-0 border-b border-[#E5E2DE] bg-[#FAF9F7]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#CC785C]" />
            <h1 className="text-[16px] font-semibold text-[#1A1A1A]">AI Assistant</h1>
            <div className="relative">
              <button onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-[11px] text-[#737373] hover:text-[#404040] ml-2 px-2 py-1 rounded border border-[#E5E2DE] hover:border-[#CC785C] transition-colors">
                <History size={11} /><ChevronDown size={10} />
              </button>
              {showHistory && (
                <div className="absolute top-8 left-0 w-64 bg-white border border-[#E5E2DE] rounded-xl shadow-lg z-20 overflow-hidden">
                  <button onClick={() => { setThread([]); setSessionId(null); setShowHistory(false); }}
                    className="flex items-center gap-2 w-full px-4 py-3 text-[12px] text-[#CC785C] font-semibold hover:bg-[#FAF9F7] border-b border-[#E5E2DE]">
                    <Plus size={13} /> New Session
                  </button>
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
              <CheckCheck size={13} />Save all ({pendingCount})
            </button>
          )}
        </div>
        <p className="text-[11px] text-[#737373] mt-0.5 hidden md:block">Talk naturally · Upload files · "Add Anka Diversify for me" works too</p>
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
              <p className="text-[12px] text-[#AAA] leading-relaxed italic">"Can you add Anka Diversify for me?" or "Create a project called Loophaul"</p>
              <p className="text-[11px] text-[#555] mt-1.5">Or: "Worked on Raahbaan today, blocked on legal structure" → extracts + saves</p>
            </div>
          </div>
        )}

        {thread.map((entry, msgIdx) => (
          <div key={msgIdx} className="space-y-2">
            <div className={`flex ${entry.message.role === "user" ? "justify-end" : "justify-start"}`}>
              {entry.message.role === "user" ? (
                <div className="bg-[#1A1A1A] text-white rounded-2xl rounded-br-sm px-4 py-3 max-w-[85%] md:max-w-xl">
                  {entry.message.filename
                    ? <div className="flex items-center gap-2"><FileText size={14} className="text-[#CC785C]" /><span className="text-[13px]">{entry.message.content}</span></div>
                    : <p className="text-[13px] leading-relaxed">{entry.message.content}</p>
                  }
                </div>
              ) : (
                <div className="bg-white border border-[#E5E2DE] rounded-2xl rounded-bl-sm px-4 py-4 max-w-[85%] md:max-w-xl">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={11} className="text-[#CC785C]" />
                    <span className="text-[10px] font-semibold text-[#CC785C] uppercase tracking-wide">Buddies AI</span>
                  </div>
                  <div className="text-[13px] text-[#404040] leading-relaxed prose prose-sm max-w-none prose-strong:text-[#1A1A1A] prose-strong:font-semibold prose-li:text-[#404040] prose-p:text-[#404040] prose-p:my-1">
                    <ReactMarkdown>{entry.message.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            {/* Action card — project creation */}
            {entry.action && (
              <div className="flex justify-end">
                <div className="max-w-[85%] md:max-w-xl w-full">
                  <ActionCard
                    entry={entry}
                    onConfirm={async (name, desc) => await handleCreateProject(msgIdx, name, desc)}
                    onDismiss={() => handleDismissAction(msgIdx)}
                  />
                </div>
              </div>
            )}

            {/* Extraction chips */}
            {entry.extractions && entry.extractions.length > 0 && (
              <div className="flex justify-end">
                <div className="max-w-[85%] md:max-w-xl w-full space-y-1.5">
                  <p className="text-[10px] text-[#737373] font-semibold uppercase tracking-wide px-1">Extracted — ✎ edit · assign project · ✓ save</p>
                  {entry.extractions.map(item => (
                    <ExtractionChip key={item.id} item={item} projects={projects}
                      onSave={() => handleSave(msgIdx, item.id)}
                      onDismiss={() => handleDismiss(msgIdx, item.id)}
                      onEdit={val => handleEdit(msgIdx, item.id, val)}
                      onProjectChange={(id, name) => handleProjectChange(msgIdx, item.id, id, name)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {(loading || uploading) && (
          <div className="flex justify-start">
            <div className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-[#CC785C]" />
              <span className="text-[12px] text-[#737373]">{uploading ? "Reading file..." : "Thinking..."}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 md:px-8 pb-4 pt-3 shrink-0 border-t border-[#E5E2DE] bg-[#FAF9F7]">
        <div className="flex items-center gap-2 bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 focus-within:border-[#CC785C]/40 transition-colors">
          <input ref={fileRef} type="file" className="hidden"
            accept=".pdf,.txt,.md,.doc,.docx,.jpg,.jpeg,.png,.webp"
            onChange={handleFileUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={loading || uploading}
            className="text-[#737373] hover:text-[#CC785C] transition-colors disabled:opacity-40 shrink-0">
            <Paperclip size={16} />
          </button>
          <input
            className="flex-1 bg-transparent outline-none text-[13px] text-[#404040] placeholder:text-[#999]"
            placeholder='Talk, upload a file, or say "add Anka Diversify for me"...'
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            disabled={loading || uploading} autoFocus />
          <button onClick={() => send()} disabled={!input.trim() || loading || uploading}
            className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors disabled:opacity-40 shrink-0">
            {loading ? <Loader2 size={13} className="animate-spin text-white" /> : <Send size={14} className="text-white" />}
          </button>
        </div>
        <p className="text-[10px] text-[#999] mt-1.5 text-center">Questions answered · Statements extracted · Projects created on request</p>
      </div>
    </div>
  );
}


export default function AIPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-[#737373] text-sm">Loading...</div>}>
      <AIPageInner />
    </Suspense>
  );
}

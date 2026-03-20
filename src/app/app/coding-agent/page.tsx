"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Send, Check, Copy, X, Plus, Trash2, MessageSquare,
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  GitBranch, RefreshCw, ExternalLink, AlertCircle, Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// -- Types ---------------------------------------------------------------------
type Project = { id: string; name: string; status: string };
type Integration = { id: string; type: string; name: string; config: any };
type Task = { id: string; title: string; description?: string; status: string; priority: number };
type Message = { role: "user" | "assistant"; content: string; ts?: string };
type Session = { id: string; title: string; created_at: string };
type FileNode = { path: string; type: "blob" | "tree"; name: string; children?: FileNode[] };

// -- File tree builder ---------------------------------------------------------
function buildTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  paths.forEach(path => {
    const parts = path.split("/");
    let current = root;
    let fullPath = "";

    parts.forEach((part, i) => {
      fullPath = fullPath ? `${fullPath}/${part}` : part;
      if (!map[fullPath]) {
        const node: FileNode = {
          path: fullPath,
          name: part,
          type: i === parts.length - 1 ? "blob" : "tree",
          children: i < parts.length - 1 ? [] : undefined,
        };
        map[fullPath] = node;
        current.push(node);
      }
      if (map[fullPath].children) current = map[fullPath].children!;
    });
  });

  return root;
}

// -- Code block renderer -------------------------------------------------------
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[#2D2D2D]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#161616]">
        <span className="text-[10px] text-[#737373] font-mono uppercase tracking-wider">{lang || "code"}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1 text-[10px] text-[#737373] hover:text-white transition-colors">
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#0D0D0D] text-[#E5E2DE] text-[12px] font-mono p-4 overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

function renderMessage(text: string): React.ReactNode[] {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const lines = part.slice(3, -3).split("\n");
      const lang = lines[0].trim();
      const code = lines.slice(1).join("\n");
      return <CodeBlock key={i} code={code} lang={lang} />;
    }
    // Inline formatting
    const segments = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    const rendered = segments.map((seg, j) => {
      if (seg.startsWith("`") && seg.endsWith("`"))
        return <code key={j} className="font-mono text-[11px] bg-[#1E1E1E] text-[#B5622A] px-1 py-0.5 rounded">{seg.slice(1,-1)}</code>;
      if (seg.startsWith("**") && seg.endsWith("**"))
        return <strong key={j} className="font-semibold text-white">{seg.slice(2,-2)}</strong>;
      return seg;
    });
    return <p key={i} className="text-[13px] text-[#C8C5C0] leading-relaxed whitespace-pre-wrap mb-1">{rendered}</p>;
  });
}

// -- File Tree Node -------------------------------------------------------------
function TreeNode({ node, depth, selectedFile, onSelect, expandedDirs, toggleDir }: {
  node: FileNode; depth: number; selectedFile: string | null;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
}) {
  const isDir = node.type === "tree";
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedFile === node.path;

  const fileIcon = (name: string) => {
    if (name.endsWith(".tsx") || name.endsWith(".jsx")) return <span className="text-[#61AFEF] text-[10px]">TSX</span>;
    if (name.endsWith(".ts") || name.endsWith(".js")) return <span className="text-[#E5C07B] text-[10px]">TS</span>;
    if (name.endsWith(".css")) return <span className="text-[#E06C75] text-[10px]">CSS</span>;
    if (name.endsWith(".json")) return <span className="text-[#98C379] text-[10px]">JSON</span>;
    if (name.endsWith(".md")) return <span className="text-[#56B6C2] text-[10px]">MD</span>;
    return <File size={11} className="text-[#737373]" />;
  };

  return (
    <div>
      <div
        onClick={() => isDir ? toggleDir(node.path) : onSelect(node.path)}
        className={`flex items-center gap-1.5 px-2 py-[3px] cursor-pointer rounded transition-colors group
          ${isSelected ? "bg-[#B5622A20] text-white" : "text-[#8A8A8A] hover:bg-[#1E1E1E] hover:text-[#C8C5C0]"}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {isDir ? (
          <>
            {isExpanded ? <ChevronDown size={11} className="shrink-0 text-[#525252]" /> : <ChevronRight size={11} className="shrink-0 text-[#525252]" />}
            {isExpanded ? <FolderOpen size={12} className="shrink-0 text-[#E5C07B]" /> : <Folder size={12} className="shrink-0 text-[#E5C07B]" />}
          </>
        ) : (
          <>
            <span className="w-[11px] shrink-0" />
            {fileIcon(node.name)}
          </>
        )}
        <span className="text-[12px] truncate">{node.name}</span>
      </div>
      {isDir && isExpanded && node.children?.map(child => (
        <TreeNode key={child.path} node={child} depth={depth + 1}
          selectedFile={selectedFile} onSelect={onSelect}
          expandedDirs={expandedDirs} toggleDir={toggleDir} />
      ))}
    </div>
  );
}

// -- Main Component ------------------------------------------------------------
export default function CodingAgentPage() {
  // Core
  const [projects, setProjects] = useState<Project[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Repo / file explorer
  const [repoInput, setRepoInput] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [recentCommits, setRecentCommits] = useState<string[]>([]);

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // File changes / PR
  const [fileChanges, setFileChanges] = useState<Array<{path: string; content: string; description: string}>>([]);
  const [pendingPR, setPendingPR] = useState<{title: string; branch: string; body: string} | null>(null);
  const [creatingPR, setCreatingPR] = useState(false);
  const [prResult, setPrResult] = useState<string | null>(null);

  // Model
  const [selectedModel, setSelectedModel] = useState<"claude-sonnet-4-5" | "gpt-4o">("claude-sonnet-4-5");

  // Images
  const [attachedImages, setAttachedImages] = useState<File[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { init(); loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Paste handler
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) setAttachedImages(prev => [...prev, file]);
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: proj }, { data: integ }] = await Promise.all([
      supabase.from("projects").select("id, name, status").eq("user_id", user.id).eq("status", "active"),
      supabase.from("integrations").select("*").eq("user_id", user.id).eq("status", "active").eq("type", "github"),
    ]);
    setProjects(proj ?? []);
    setIntegrations(integ ?? []);
    // Auto-load first repo
    const firstRepo = integ?.[0]?.config?.repo_url
      ?.replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "") ?? "";
    if (firstRepo) { setRepoInput(firstRepo); setSelectedRepo(firstRepo); loadRepo(firstRepo, integ?.[0]); }
  }

  async function loadSessions() {
    const res = await fetch("/api/ai/sessions?agent_type=coding_agent");
    if (!res.ok) return;
    const { sessions: data } = await res.json();
    setSessions(data ?? []);
  }

  async function openSession(session: Session) {
    setActiveSessionId(session.id);
    const res = await fetch(`/api/ai/sessions?id=${session.id}`);
    if (res.ok) {
      const { session: data } = await res.json();
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/ai/sessions?id=${id}`, { method: "DELETE" });
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
    await loadSessions();
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setFileChanges([]);
    setPendingPR(null);
    setPrResult(null);
  }

  async function selectProject(project: Project) {
    setSelectedProject(project);
    setSelectedTask(null);
    const { data } = await supabase.from("project_tasks")
      .select("id, title, description, status, priority")
      .eq("project_id", project.id).neq("status", "cancelled").neq("status", "done").order("priority");
    setTasks(data ?? []);
  }

  function getGhHeaders(integration: Integration) {
    return {
      Authorization: `token ${integration.config.access_token}`,
      Accept: "application/vnd.github.v3+json",
    };
  }

  async function loadRepo(repo: string, integration?: Integration) {
    const integ = integration ?? integrations[0];
    if (!integ?.config?.access_token || !repo) return;
    setRepoLoading(true);
    setRepoError("");
    setFileTree([]);
    setSelectedFile(null);
    setFileContent("");

    const headers = getGhHeaders(integ);
    try {
      const [treeRes, commitsRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, { headers, signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, { headers, signal: AbortSignal.timeout(5000) }),
      ]);

      if (!treeRes.ok) { setRepoError("Could not load repo � check name and permissions."); setRepoLoading(false); return; }

      const [treeData, commitsData] = await Promise.all([
        treeRes.json(), commitsRes.ok ? commitsRes.json() : null,
      ]);

      const paths = (treeData?.tree ?? [])
        .filter((f: any) => !f.path.includes("node_modules") && !f.path.includes(".next") && !f.path.startsWith(".git"))
        .map((f: any) => f.path);

      setFileTree(buildTree(paths));
      setRecentCommits(Array.isArray(commitsData) ? commitsData.map((c: any) => c.commit?.message?.split("\n")[0] ?? "").filter(Boolean) : []);
    } catch {
      setRepoError("Request timed out. Check repo name.");
    }
    setRepoLoading(false);
  }

  function toggleDir(path: string) {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  async function selectFile(path: string) {
    setSelectedFile(path);
    setFileLoading(true);
    setFileContent("");
    const integ = integrations[0];
    if (!integ?.config?.access_token) { setFileLoading(false); return; }

    const headers = getGhHeaders(integ);
    try {
      const res = await fetch(`https://api.github.com/repos/${selectedRepo}/contents/${path}`, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.encoding === "base64") {
          setFileContent(atob(data.content.replace(/\n/g, "")));
        }
      }
    } catch {}
    setFileLoading(false);
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    const newMsg: Message = { role: "user", content: userMsg, ts: new Date().toISOString() };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    // Upload images
    const imageUrls: string[] = [];
    for (const file of attachedImages) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/ai/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          if (url) imageUrls.push(url);
        }
      } catch {}
    }
    setAttachedImages([]);

    const contextParts: string[] = [];
    if (selectedProject) contextParts.push(`Project: ${selectedProject.name}`);
    if (selectedTask) contextParts.push(`Active task:\n${selectedTask.title}\n${selectedTask.description ?? ""}`);
    if (selectedRepo) contextParts.push(`Repository: ${selectedRepo}`);
    if (selectedFile && fileContent) {
      contextParts.push(`Currently viewing: ${selectedFile}\n\`\`\`\n${fileContent.slice(0, 3000)}${fileContent.length > 3000 ? "\n... (truncated)" : ""}\n\`\`\``);
    }
    if (recentCommits.length > 0) contextParts.push(`Recent commits:\n${recentCommits.join("\n")}`);

    const systemPrompt = `You are a senior software engineer and coding agent for Buddies OS.

${contextParts.join("\n\n")}

FILE EXPLORER CONTEXT:
- The user can see the file tree on the left and view any file in the center panel
- When they ask about a file or function, assume they may have it open
- Reference specific file paths when making suggestions

RULES:
- Write production-quality code only. No TODOs, no placeholders.
- Always specify the exact file path before any code block.
- When proposing file changes, use this exact format:
  [FILE_CHANGE]
  {"path": "src/exact/path/file.ts", "content": "// complete file content", "description": "What this fixes"}
  [/FILE_CHANGE]
- Multiple FILE_CHANGE blocks are supported � use one per file.
- After FILE_CHANGE blocks say: "Ready to apply � click Apply Changes below."
- For PR creation: [CREATE_PR] title="..." branch="fix/..." body="..."
- Be surgical � only change what needs changing.
- When you see an error, trace it to the root cause before proposing a fix.`;

    try {
      const res = await fetch("/api/coding-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-14).map(m => ({ role: m.role, content: m.content })),
          provider: selectedModel === "gpt-4o" ? "openai" : "anthropic",
          model: selectedModel,
          systemPrompt,
          images: imageUrls.length > 0 ? imageUrls : undefined,
        }),
      });

      const data = await res.json();
      const reply = data.response ?? "No response.";

      // Parse FILE_CHANGE blocks
      const fileChangeRegex = /\[FILE_CHANGE\]\s*([\s\S]*?)\s*\[\/FILE_CHANGE\]/g;
      const newChanges: Array<{path: string; content: string; description: string}> = [];
      let match;
      while ((match = fileChangeRegex.exec(reply)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.path && parsed.content) newChanges.push(parsed);
        } catch {}
      }
      if (newChanges.length > 0) setFileChanges(prev => [...prev, ...newChanges]);

      // Parse PR signal
      const prMatch = reply.match(/\[CREATE_PR\]\s*title="([^"]+)"\s*branch="([^"]+)"(?:\s*body="([^"]*)")?/);
      if (prMatch) setPendingPR({ title: prMatch[1], branch: prMatch[2], body: prMatch[3] ?? "" });

      const cleanReply = reply
        .replace(/\[FILE_CHANGE\][\s\S]*?\[\/FILE_CHANGE\]/g, "")
        .replace(/\[CREATE_PR\][^\n]*/g, "")
        .trim();

      const assistantMsg: Message = { role: "assistant", content: cleanReply || reply, ts: new Date().toISOString() };
      const updatedMessages = [...messages, newMsg, assistantMsg];
      setMessages(prev => [...prev, assistantMsg]);

      // Save session
      if (activeSessionId) {
        fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: activeSessionId, messages: updatedMessages, agent_type: "coding_agent" }) }).catch(() => {});
      } else {
        const saveRes = await fetch("/api/ai/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: userMsg.slice(0, 50), messages: updatedMessages, agent_type: "coding_agent" }) }).catch(() => null);
        if (saveRes?.ok) {
          const { sessionId } = await saveRes.json();
          if (sessionId) setActiveSessionId(sessionId);
        }
      }
      await loadSessions();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again." }]);
    }
    setLoading(false);
  }

  async function applyChanges() {
    if (!fileChanges.length || !selectedRepo) return;
    setCreatingPR(true);
    const branch = pendingPR?.branch ?? `fix/buddies-${Date.now()}`;
    const title = pendingPR?.title ?? "Fix from Buddies Coding Agent";

    const res = await fetch("/api/coding-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_pr_with_files",
        repo: selectedRepo,
        branch,
        files: fileChanges,
        prTitle: title,
        prBody: fileChanges.map(f => `- ${f.path}: ${f.description}`).join("\n"),
        taskId: selectedTask?.id ?? null,
      }),
    });

    const data = await res.json();
    if (data.pr_url) {
      setPrResult(data.pr_url);
      setMessages(prev => [...prev, { role: "assistant", content: `? PR created � ${data.files_written?.length ?? 0} file(s) changed.\n\nView PR: ${data.pr_url}\n\nMerge to deploy via Vercel.` }]);
      setFileChanges([]);
      setPendingPR(null);
    } else {
      setMessages(prev => [...prev, { role: "assistant", content: `? PR failed: ${data.error}` }]);
    }
    setCreatingPR(false);
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  const CODING_MODELS = [
    { model: "claude-sonnet-4-5" as const, label: "Sonnet 4.5", provider: "anthropic" },
    { model: "gpt-4o" as const, label: "GPT-4o", provider: "openai" },
  ];

  return (
    <div className="flex h-full bg-[#0D0D0D] text-white overflow-hidden select-none">

      {/* -- Panel 1: Session history ---------------------------------------- */}
      <div className="w-[180px] shrink-0 flex flex-col border-r border-[#1E1E1E] bg-[#111111]">
        <div className="px-3 py-3 border-b border-[#1E1E1E]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-[#525252] uppercase tracking-widest">Sessions</span>
          </div>
          <button onClick={startNewChat}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#B5622A] text-white text-[11px] font-semibold hover:bg-[#9A4E20] transition-colors">
            <Plus size={11} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 && <p className="text-[10px] text-[#3A3A3A] px-3 py-4 text-center">No sessions yet</p>}
          {sessions.map(s => (
            <div key={s.id} onClick={() => openSession(s)}
              className={`group relative px-3 py-2 cursor-pointer transition-colors
                ${activeSessionId === s.id ? "bg-[#1E1E1E]" : "hover:bg-[#161616]"}`}>
              <div className="flex items-start gap-1.5">
                <MessageSquare size={10} className="shrink-0 mt-0.5 text-[#525252]" />
                <span className="text-[11px] text-[#737373] group-hover:text-[#B0ADA9] line-clamp-2 leading-snug">{s.title || "Chat"}</span>
              </div>
              <button onClick={e => deleteSession(s.id, e)}
                className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5 rounded">
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>

        {/* Model selector at bottom of session panel */}
        <div className="border-t border-[#1E1E1E] p-2 space-y-1">
          <p className="text-[9px] text-[#3A3A3A] uppercase tracking-widest px-1 mb-1.5">Model</p>
          {CODING_MODELS.map(m => (
            <button key={m.model} onClick={() => setSelectedModel(m.model)}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors
                ${selectedModel === m.model ? "bg-[#B5622A20] text-[#B5622A] font-semibold" : "text-[#525252] hover:text-[#737373] hover:bg-[#161616]"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* -- Panel 2: File explorer ------------------------------------------ */}
      <div className="w-[220px] shrink-0 flex flex-col border-r border-[#1E1E1E] bg-[#111111]">
        {/* Repo input */}
        <div className="px-3 py-3 border-b border-[#1E1E1E]">
          <div className="flex items-center gap-1 mb-2">
            <GitBranch size={11} className="text-[#525252]" />
            <span className="text-[10px] font-bold text-[#525252] uppercase tracking-widest">Explorer</span>
            {repoLoading && <Loader2 size={10} className="ml-auto text-[#737373] animate-spin" />}
          </div>
          <div className="flex gap-1">
            <input
              value={repoInput}
              onChange={e => setRepoInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setSelectedRepo(repoInput); loadRepo(repoInput); } }}
              placeholder="owner/repo"
              className="flex-1 text-[11px] px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[#B0ADA9] placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#B5622A] font-mono"
            />
            <button onClick={() => { setSelectedRepo(repoInput); loadRepo(repoInput); }}
              className="px-2 py-1.5 bg-[#1E1E1E] hover:bg-[#2D2D2D] rounded transition-colors">
              <RefreshCw size={11} className="text-[#737373]" />
            </button>
          </div>
          {repoError && <p className="text-[10px] text-red-400 mt-1">{repoError}</p>}
          {selectedRepo && !repoLoading && fileTree.length > 0 && (
            <p className="text-[10px] text-[#525252] mt-1 font-mono truncate">{selectedRepo}</p>
          )}
        </div>

        {/* Project + task selector */}
        <div className="px-3 py-2 border-b border-[#1E1E1E]">
          <select value={selectedProject?.id ?? ""} onChange={e => { const p = projects.find(p => p.id === e.target.value); if (p) selectProject(p); }}
            className="w-full text-[11px] px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[#737373] focus:outline-none mb-1">
            <option value="">� Select project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {tasks.length > 0 && (
            <select value={selectedTask?.id ?? ""} onChange={e => { const t = tasks.find(t => t.id === e.target.value); setSelectedTask(t ?? null); }}
              className="w-full text-[11px] px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[#737373] focus:outline-none">
              <option value="">� Select task</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {fileTree.length === 0 && !repoLoading && (
            <p className="text-[10px] text-[#3A3A3A] px-3 py-6 text-center leading-relaxed">Enter a repo name above and press Enter</p>
          )}
          {fileTree.map(node => (
            <TreeNode key={node.path} node={node} depth={0}
              selectedFile={selectedFile} onSelect={selectFile}
              expandedDirs={expandedDirs} toggleDir={toggleDir} />
          ))}
        </div>
      </div>

      {/* -- Panel 3: Code viewer -------------------------------------------- */}
      <div className="flex-1 flex flex-col border-r border-[#1E1E1E] bg-[#0D0D0D] min-w-0">
        {/* Tab bar */}
        <div className="flex items-center border-b border-[#1E1E1E] bg-[#111111] shrink-0 h-[35px]">
          {selectedFile ? (
            <div className="flex items-center gap-2 px-4 h-full border-r border-[#2D2D2D] bg-[#0D0D0D]">
              <span className="text-[11px] text-[#B0ADA9] font-mono">{selectedFile.split("/").pop()}</span>
              <button onClick={() => { setSelectedFile(null); setFileContent(""); }}
                className="text-[#525252] hover:text-white transition-colors">
                <X size={11} />
              </button>
            </div>
          ) : (
            <span className="px-4 text-[11px] text-[#3A3A3A]">No file open</span>
          )}
          {selectedFile && (
            <span className="ml-2 text-[10px] text-[#3A3A3A] font-mono truncate">{selectedFile}</span>
          )}
          {prResult && (
            <a href={prResult} target="_blank" rel="noopener noreferrer"
              className="ml-auto mr-3 flex items-center gap-1.5 text-[10px] text-[#10B981] hover:text-[#34D399] transition-colors">
              <ExternalLink size={10} /> View PR
            </a>
          )}
        </div>

        {/* File content */}
        <div className="flex-1 overflow-auto">
          {fileLoading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={16} className="text-[#525252] animate-spin" />
            </div>
          )}
          {!fileLoading && !selectedFile && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-10 h-10 rounded-xl bg-[#1E1E1E] flex items-center justify-center mb-4">
                <File size={18} className="text-[#525252]" />
              </div>
              <p className="text-[13px] text-[#525252] mb-2">No file selected</p>
              <p className="text-[11px] text-[#3A3A3A] max-w-[260px] leading-relaxed">Click any file in the explorer to view its contents. The agent can read and modify open files.</p>
              {recentCommits.length > 0 && (
                <div className="mt-6 text-left w-full max-w-[360px]">
                  <p className="text-[10px] text-[#3A3A3A] uppercase tracking-widest mb-2">Recent commits</p>
                  {recentCommits.map((c, i) => (
                    <p key={i} className="text-[11px] text-[#525252] font-mono py-0.5 truncate">� {c}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {!fileLoading && selectedFile && fileContent && (
            <div className="relative">
              <div className="flex">
                <div className="select-none shrink-0 py-4 px-3 text-right bg-[#0A0A0A] border-r border-[#1A1A1A]">
                  {fileContent.split("\n").map((_, i) => (
                    <div key={i} className="text-[11px] text-[#3A3A3A] font-mono leading-[1.6] h-[20px]">{i + 1}</div>
                  ))}
                </div>
                <pre className="flex-1 p-4 text-[12px] font-mono text-[#C8C5C0] overflow-x-auto leading-[1.6] select-text whitespace-pre">
                  {fileContent}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -- Panel 4: Chat agent --------------------------------------------- */}
      <div className="w-[380px] shrink-0 flex flex-col bg-[#111111] border-l border-[#1E1E1E]">
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E1E] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px]">?</span>
            <span className="text-[12px] font-bold text-[#B0ADA9]">Agent</span>
            <span className="text-[10px] text-[#3A3A3A]">�</span>
            <span className="text-[10px] text-[#525252]">{selectedModel}</span>
          </div>
          {selectedTask && (
            <div className="flex items-center gap-1.5 max-w-[160px]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#B5622A] shrink-0" />
              <span className="text-[10px] text-[#737373] truncate">{selectedTask.title}</span>
              <button onClick={() => setSelectedTask(null)} className="text-[#3A3A3A] hover:text-[#737373] transition-colors shrink-0"><X size={9} /></button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {messages.length === 0 && (
            <div className="pt-8 text-center">
              <p className="text-[12px] text-[#525252] mb-6">Ask me about the codebase, request changes, or debug issues.</p>
              <div className="space-y-2">
                {[
                  "Explain what this file does",
                  "Find all TODOs in this repo",
                  "Fix the bug in the open file",
                  "Implement the selected task",
                ].map(s => (
                  <button key={s} onClick={() => { setInput(s); setTimeout(() => textareaRef.current?.focus(), 0); }}
                    className="w-full text-left text-[11px] text-[#525252] hover:text-[#B0ADA9] px-3 py-2 rounded bg-[#0D0D0D] hover:bg-[#161616] border border-[#1E1E1E] hover:border-[#2D2D2D] transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px]
                ${msg.role === "user" ? "bg-[#B5622A] text-white font-bold" : "bg-[#1E1E1E] text-white"}`}>
                {msg.role === "user" ? "S" : "?"}
              </div>
              <div className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed max-w-[300px]
                ${msg.role === "user" ? "bg-[#B5622A15] border border-[#B5622A30] text-[#C8C5C0]" : "bg-[#161616] border border-[#1E1E1E]"}`}>
                {msg.role === "user"
                  ? <p className="text-[13px] text-[#C8C5C0] whitespace-pre-wrap">{msg.content}</p>
                  : <div>{renderMessage(msg.content)}</div>
                }
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-[#1E1E1E] flex items-center justify-center shrink-0 text-[11px]">?</div>
              <div className="bg-[#161616] border border-[#1E1E1E] rounded-xl px-3 py-2.5">
                <div className="flex gap-1">
                  {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#525252] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* File changes panel */}
        {fileChanges.length > 0 && (
          <div className="mx-3 mb-2 rounded-lg border border-[#10B98140] bg-[#0D1A12] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#10B98120]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                <span className="text-[11px] font-semibold text-[#10B981]">{fileChanges.length} file{fileChanges.length > 1 ? "s" : ""} to apply</span>
              </div>
              <button onClick={() => { setFileChanges([]); setPendingPR(null); }}
                className="text-[#525252] hover:text-white transition-colors"><X size={11} /></button>
            </div>
            <div className="px-3 py-2 space-y-0.5">
              {fileChanges.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-[#10B981] font-bold">M</span>
                  <span className="text-[#737373] font-mono truncate">{f.path}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-[#10B98120]">
              <button onClick={applyChanges} disabled={creatingPR || !selectedRepo}
                className="w-full py-1.5 bg-[#10B981] text-white text-[11px] font-semibold rounded transition-colors hover:bg-[#059669] disabled:opacity-40">
                {creatingPR ? "Creating PR..." : "Apply Changes & Create PR"}
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 shrink-0">
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachedImages.map((file, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(file)} alt="attachment" className="w-14 h-14 rounded-lg object-cover border border-[#2D2D2D]" />
                  <button onClick={() => setAttachedImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px]">?</button>
                </div>
              ))}
            </div>
          )}
          <div className="bg-[#0D0D0D] border border-[#2D2D2D] rounded-xl focus-within:border-[#B5622A] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about code, request changes... (Enter to send)"
              rows={2}
              className="w-full bg-transparent text-[13px] text-[#C8C5C0] placeholder:text-[#3A3A3A] resize-none focus:outline-none px-3 pt-3 leading-relaxed font-mono"
              style={{ maxHeight: "160px", minHeight: "52px" }}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-[10px] text-[#3A3A3A]">?? new line</span>
              <button onClick={send} disabled={loading || !input.trim()}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 bg-[#B5622A] hover:bg-[#9A4E20] text-white">
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

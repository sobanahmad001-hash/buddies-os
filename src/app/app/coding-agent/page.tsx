"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Send, Check, Copy, X, Plus, Trash2, MessageSquare,
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  GitBranch, RefreshCw, ExternalLink, AlertCircle, Loader2, ShieldCheck, Play, Terminal,
  Github, Database, Cloud, Plug
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// -- Types ---------------------------------------------------------------------
type Project = { id: string; name: string; status: string };
type Integration = { id: string; name: string; repo: string };
type Task = { id: string; title: string; description?: string; status: string; priority: number };
type Message = { role: "user" | "assistant"; content: string; ts?: string };
type Session = { id: string; title: string; created_at: string };
type FileNode = { path: string; type: "blob" | "tree"; name: string; children?: FileNode[] };
type CodingJob = {
  id: string; repository: string; prompt: string; status: "queued" | "claimed" | "running" | "succeeded" | "failed" | "cancelled";
  changed_files?: Array<{ path: string; status: string; content: string | null }>;
  verification_results?: Array<{ name: string; status: string; command?: string; output?: string }>;
  stdout?: string; stderr?: string; diff?: string; error?: string; created_at: string;
};
type ConnectedTools = {
  github: { configured: boolean; reachable: boolean; repositories: Array<{ id: string; name: string; repository: string }> };
  supabase: { configured: boolean; reachable: boolean; host: string | null };
  vercel: { configured: boolean; reachable: boolean; projectId: string | null; deployment: null | { id: string; url: string | null; state: string; createdAt: number | null } };
};

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
    <div className="my-3 rounded-lg overflow-hidden border border-line">
      <div className="flex items-center justify-between px-3 py-2 bg-surface-subtle">
        <span className="text-[10px] text-muted font-mono uppercase tracking-wider">{lang || "code"}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1 text-[10px] text-muted hover:text-ink transition-colors">
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-canvas text-ink text-[12px] font-mono p-4 overflow-x-auto leading-relaxed">{code}</pre>
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
        return <code key={j} className="font-mono text-[11px] bg-surface-subtle text-accent px-1 py-0.5 rounded">{seg.slice(1,-1)}</code>;
      if (seg.startsWith("**") && seg.endsWith("**"))
        return <strong key={j} className="font-semibold text-ink">{seg.slice(2,-2)}</strong>;
      return seg;
    });
    return <p key={i} className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap mb-1">{rendered}</p>;
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
          ${isSelected ? "bg-accent-soft text-ink" : "text-muted hover:bg-surface-subtle hover:text-ink"}`}
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
  const [fileChanges, setFileChanges] = useState<Array<{path: string; content: string; description: string; operation?: "write" | "delete"}>>([]);
  const [pendingPR, setPendingPR] = useState<{title: string; branch: string; body: string} | null>(null);
  const [creatingPR, setCreatingPR] = useState(false);
  const [prResult, setPrResult] = useState<string | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  // Local Codex runner
  const [jobs, setJobs] = useState<CodingJob[]>([]);
  const [lastUserRequest, setLastUserRequest] = useState("");
  const [queueingJob, setQueueingJob] = useState(false);
  const [runnerError, setRunnerError] = useState("");
  const [connectedTools, setConnectedTools] = useState<ConnectedTools | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);

  // Model
  const [selectedModel, setSelectedModel] = useState<"gpt-5.6-sol" | "claude-sonnet-4-5">("gpt-5.6-sol");

  // Images
  const [attachedImages, setAttachedImages] = useState<File[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { init(); loadSessions(); loadJobs(); loadConnectedTools(); }, []);
  useEffect(() => {
    const active = jobs.some(job => ["queued", "claimed", "running"].includes(job.status));
    if (!active) return;
    const timer = window.setInterval(loadJobs, 4000);
    return () => window.clearInterval(timer);
  }, [jobs]);
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
    const [{ data: proj }, repoResponse] = await Promise.all([
      supabase.from("projects").select("id, name, status").eq("user_id", user.id).eq("status", "active"),
      fetch("/api/coding-agent").then((response) => response.json()),
    ]);
    const integ = repoResponse.repositories ?? [];
    setProjects(proj ?? []);
    setIntegrations(integ ?? []);
    const query = new URLSearchParams(window.location.search);
    const requestedProject = (proj ?? []).find((project) => project.id === query.get("projectId"));
    if (requestedProject) {
      setSelectedProject(requestedProject);
      const { data: projectTasks } = await supabase.from("project_tasks")
        .select("id, title, description, status, priority")
        .eq("project_id", requestedProject.id).neq("status", "cancelled").neq("status", "done").order("priority");
      setTasks(projectTasks ?? []);
      const requestedTask = (projectTasks ?? []).find((task) => task.id === query.get("taskId"));
      if (requestedTask) setSelectedTask(requestedTask);
    }
    // Auto-load first repo
    const firstRepo = integ?.[0]?.repo ?? "";
    if (firstRepo) { setRepoInput(firstRepo); setSelectedRepo(firstRepo); loadRepo(firstRepo, integ?.[0]); }
  }

  async function loadSessions() {
    const res = await fetch("/api/ai/sessions?agent_type=coding_agent");
    if (!res.ok) return;
    const { sessions: data } = await res.json();
    setSessions(data ?? []);
  }

  async function loadJobs() {
    try {
      const res = await fetch("/api/coding-agent/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {}
  }

  async function loadConnectedTools() {
    setToolsLoading(true);
    try {
      const res = await fetch("/api/coding-agent/integrations", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setConnectedTools(data.tools);
    } catch {}
    finally { setToolsLoading(false); }
  }

  async function queueLocalJob() {
    if (!selectedRepo || !lastUserRequest || queueingJob) return;
    setQueueingJob(true); setRunnerError("");
    try {
      const res = await fetch("/api/coding-agent/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: selectedRepo, prompt: lastUserRequest,
          projectId: selectedProject?.id ?? null, taskId: selectedTask?.id ?? null,
          verificationCommands: ["typecheck", "test", "build"],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not queue coding job");
      setJobs(prev => [data.job, ...prev]);
      setMessages(prev => [...prev, { role: "assistant", content: "Execution queued for your personal Buddies Runner. I’ll show the diff and verification results here when it finishes." }]);
    } catch (error: any) { setRunnerError(error.message); }
    finally { setQueueingJob(false); }
  }

  function reviewRunnerChanges(job: CodingJob) {
    const reviewable = (job.changed_files ?? []).filter(file => file.status === "D" || typeof file.content === "string").map(file => ({
      path: file.path, content: file.content ?? "", description: `${file.status || "M"} by verified local Coding Agent run`,
      operation: (file.status === "D" ? "delete" : "write") as "write" | "delete",
    }));
    setFileChanges(reviewable); setReviewConfirmed(false);
    if (!reviewable.length) setRunnerError("This run has no text-file changes available for PR review.");
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

  async function loadRepo(repo: string, integration?: Integration) {
    if (!repo) return;
    setRepoLoading(true);
    setRepoError("");
    setFileTree([]);
    setSelectedFile(null);
    setFileContent("");

    try {
      const response = await fetch("/api/coding-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_tree", repo }) });
      const data = await response.json();
      if (!response.ok) { setRepoError(data.error ?? "Could not load repository"); setRepoLoading(false); return; }
      setFileTree(buildTree(data.paths ?? []));
      setRecentCommits(data.commits ?? []);
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
    try {
      const res = await fetch("/api/coding-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_file", repo: selectedRepo, path }) });
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content ?? "");
      }
    } catch {}
    setFileLoading(false);
  }

  // Auto-find relevant file from user message if no file is open
  async function findRelevantFile(message: string): Promise<string | null> {
    if (!fileTree.length) return null;
    const msg = message.toLowerCase();

    // Flatten all file paths
    function flattenTree(nodes: FileNode[]): string[] {
      const paths: string[] = [];
      for (const n of nodes) {
        if (n.type === "blob") paths.push(n.path);
        if (n.children) paths.push(...flattenTree(n.children));
      }
      return paths;
    }
    const allPaths = flattenTree(fileTree);

    // Score each file against the message
    const scored = allPaths.map(path => {
      const parts = path.toLowerCase().split("/");
      const filename = parts[parts.length - 1].replace(/\.tsx?$/, "").replace(/[-_]/g, " ");
      let score = 0;
      // Direct mention of file/component name
      if (msg.includes(filename)) score += 10;
      // Path segment mentions
      parts.forEach(p => { if (msg.includes(p.replace(/[-_]/g, " "))) score += 3; });
      // Route/API mentions
      if (msg.includes("route") && path.includes("route.ts")) score += 5;
      if (msg.includes("action") && path.includes("action")) score += 5;
      if (msg.includes("project") && path.includes("project")) score += 3;
      if (msg.includes("trading") && path.includes("trading")) score += 5;
      if (msg.includes("coding") && path.includes("coding")) score += 5;
      if (msg.includes("dashboard") && path.includes("dashboard")) score += 3;
      if (msg.includes("auth") && (path.includes("auth") || path.includes("login"))) score += 5;
      if (msg.includes("api") && path.includes("api")) score += 2;
      // Error/fix patterns
      if ((msg.includes("error") || msg.includes("bug") || msg.includes("fix")) && path.endsWith("route.ts")) score += 2;
      return { path, score };
    });

    const best = scored.sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= 3) return best.path;
    return null;
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setLastUserRequest(userMsg);
    const newMsg: Message = { role: "user", content: userMsg, ts: new Date().toISOString() };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    // Auto-load relevant file if none is open
    if (!selectedFile && fileTree.length > 0) {
      const relevantPath = await findRelevantFile(userMsg);
      if (relevantPath) {
        await selectFile(relevantPath);
        // Small delay to let fileContent state update
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

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
      contextParts.push(`FILE OPEN: ${selectedFile}\n\`\`\`\n${fileContent.slice(0, 4000)}${fileContent.length > 4000 ? "\n... (truncated, file continues)" : ""}\n\`\`\``);
    } else if (selectedFile) {
      contextParts.push(`File selected: ${selectedFile} (loading content...)`);
    }
    if (recentCommits.length > 0) contextParts.push(`Recent commits:\n${recentCommits.slice(0, 3).join("\n")}`);
    if (connectedTools) contextParts.push(`Connected engineering tools: GitHub ${connectedTools.github.reachable ? "connected" : "unavailable"}; Supabase ${connectedTools.supabase.reachable ? "connected" : "unavailable"}; Vercel ${connectedTools.vercel.reachable ? `connected (${connectedTools.vercel.deployment?.state ?? "unknown"})` : "unavailable"}. Never request or expose their credentials.`);

    const systemPrompt = `You are a senior software engineer and coding agent for Buddies OS.

${contextParts.join("\n\n")}

FILE EXPLORER CONTEXT:
- The user can see the file tree on the left and view any file in the center panel
- When they ask about a file or function, assume they may have it open
- Reference specific file paths when making suggestions

PROACTIVE FILE AWARENESS:
- If the user describes a bug or feature and you can identify the relevant file from the repo structure, tell them: "I can see this likely involves [file path] — let me look at it. Click that file in the explorer and I'll give you the exact fix."
- If a FILE OPEN section is present above, use it as your primary source of truth. Reference specific line numbers and function names.
- If no file is open but you know which file is relevant from context, name it explicitly.

RULES:
- Write production-quality code only. No TODOs, no placeholders.
- Always specify the exact file path before any code block.
- When proposing file changes, use EXACTLY this format with no markdown code fences inside:
  [FILE_CHANGE]
  {"path": "src/exact/path/file.ts", "content": "// complete file content here", "description": "What this fixes"}
  [/FILE_CHANGE]
- CRITICAL: The content between [FILE_CHANGE] and [/FILE_CHANGE] must be raw JSON only. No \`\`\`json wrappers. No markdown. Raw JSON object only.
- Multiple FILE_CHANGE blocks are supported — use one per file.
- After FILE_CHANGE blocks say: "Ready to apply — click Apply Changes below."
- For PR creation: [CREATE_PR] title="..." branch="fix/..." body="..."
- Be surgical — only change what needs changing.
- When you see an error, trace it to the root cause before proposing a fix.`;

    try {
      const res = await fetch("/api/coding-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-14).map(m => ({ role: m.role, content: m.content })),
          provider: selectedModel === "claude-sonnet-4-5" ? "anthropic" : "openai",
          model: selectedModel,
          systemPrompt,
          images: imageUrls.length > 0 ? imageUrls : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Coding Agent request failed (${res.status})`);
      }
      const reply = data.response ?? "No response.";

      // Parse FILE_CHANGE blocks
      const fileChangeRegex = /\[FILE_CHANGE\]\s*([\s\S]*?)\s*\[\/FILE_CHANGE\]/g;
      const newChanges: Array<{path: string; content: string; description: string; operation?: "write" | "delete"}> = [];
      let match;
      while ((match = fileChangeRegex.exec(reply)) !== null) {
        try {
          // Strip markdown code fences GPT-4o adds even when told not to
          const raw = match[1]
            .replace(/^\s*```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "")
            .trim();
          const parsed = JSON.parse(raw);
          if (parsed.path && parsed.content) newChanges.push(parsed);
        } catch {}
      }
      if (newChanges.length > 0) setFileChanges(prev => [...prev, ...newChanges]);

      // Parse PR signal
      const prMatch = reply.match(/\[CREATE_PR\][^\n]*title="([^"]+)"[^\n]*branch="([^"]+)"(?:[^\n]*body="([^"]*)")?/s);
      if (prMatch) setPendingPR({ title: prMatch[1], branch: prMatch[2], body: prMatch[3] ?? "" });

      const cleanReply = reply
        .replace(/\[FILE_CHANGE\][\s\S]*?\[\/FILE_CHANGE\]/g, "")
        .replace(/\[CREATE_PR\][^\n]*/g, "")
        .trim();

      const assistantMsg: Message = { role: "assistant", content: cleanReply || reply, ts: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);
      const updatedMessages = [...messages, newMsg, assistantMsg];

      // Save session
      try {
        if (activeSessionId) {
          await fetch("/api/ai/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: activeSessionId, messages: updatedMessages, agent_type: "coding_agent" }),
          });
        } else {
          const saveRes = await fetch("/api/ai/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: userMsg.slice(0, 50), messages: updatedMessages, agent_type: "coding_agent" }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            if (saveData?.sessionId) setActiveSessionId(saveData.sessionId);
          }
        }
        await loadSessions();
      } catch (sessionErr) {
        console.error("[coding-agent] session save failed:", sessionErr);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection error. Try again.";
      setMessages(prev => [...prev, { role: "assistant", content: `Coding Agent error: ${message}` }]);
    }
    setLoading(false);
  }

  async function applyChanges() {
    if (!fileChanges.length || !selectedRepo || !reviewConfirmed) return;
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
      setReviewConfirmed(false);
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
    { model: "gpt-5.6-sol" as const,      label: "GPT-5.6 Sol", provider: "openai"    },
    { model: "claude-sonnet-4-5" as const, label: "Sonnet 4.5", provider: "anthropic" },
  ];

  return (
    <div className="relative flex h-full flex-col bg-canvas text-ink overflow-hidden">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-[13px] text-white">⚡</div>
            <div><p className="text-[12px] font-semibold text-ink">Single Coding Agent</p><p className="text-[10px] text-muted">{selectedProject ? `${selectedProject.name}${selectedTask ? ` · ${selectedTask.title}` : ""}` : "Choose project context when needed"}</p></div>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {["Plan", "Review", "Approve", "Execute", "Verify"].map((step, index) => <div key={step} className="flex items-center gap-1"><span className={`rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${index === 0 ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}>{index + 1}. {step}</span>{index < 4 && <ChevronRight size={10} className="text-faint" />}</div>)}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setToolsOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5 text-[10px] font-semibold text-ink hover:border-line-strong">
              <Plug size={11} className="text-accent" /> Connected tools
              {connectedTools && <span className="text-positive">{[connectedTools.github, connectedTools.supabase, connectedTools.vercel].filter(tool => tool.reachable).length}/3</span>}
            </button>
            <div className="flex items-center gap-1.5 text-[10px] text-positive"><ShieldCheck size={12} /> Changes require approval</div>
          </div>
        </div>
      </div>
      {toolsOpen && (
        <div className="absolute inset-0 z-50 flex items-start justify-end bg-black/40 p-3 md:p-6" onClick={() => setToolsOpen(false)}>
          <div className="flex h-full w-full max-w-[430px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div><p className="text-[13px] font-semibold text-ink">Coding Agent tools</p><p className="text-[10px] text-muted">Server-side connections; secrets are never sent to the browser.</p></div>
              <button onClick={() => setToolsOpen(false)} className="rounded-lg p-1 text-muted hover:bg-surface-subtle hover:text-ink"><X size={14} /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {toolsLoading && <div className="flex items-center gap-2 text-[11px] text-muted"><Loader2 size={12} className="animate-spin" /> Checking tools…</div>}
              {connectedTools && ([
                { key: "github", label: "GitHub", icon: Github, tool: connectedTools.github, detail: connectedTools.github.repositories.length ? connectedTools.github.repositories.map(repo => repo.repository).join(", ") : "Repository access and pull requests" },
                { key: "supabase", label: "Supabase", icon: Database, tool: connectedTools.supabase, detail: connectedTools.supabase.host ?? "Database, auth, and migrations" },
                { key: "vercel", label: "Vercel", icon: Cloud, tool: connectedTools.vercel, detail: connectedTools.vercel.deployment ? `${connectedTools.vercel.deployment.state} · ${connectedTools.vercel.deployment.url ?? connectedTools.vercel.projectId}` : "Deployments and runtime logs" },
              ] as const).map(item => {
                const Icon = item.icon; const healthy = item.tool.reachable;
                return <div key={item.key} className="rounded-xl border border-line bg-surface-subtle p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface"><Icon size={15} className="text-ink" /></div>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-[12px] font-semibold text-ink">{item.label}</p><span className={`rounded-full px-1.5 py-0.5 text-[9px] ${healthy ? "bg-positive/10 text-positive" : item.tool.configured ? "bg-red-500/10 text-red-400" : "bg-surface text-muted"}`}>{healthy ? "Connected" : item.tool.configured ? "Needs attention" : "Not configured"}</span></div><p className="mt-1 truncate text-[10px] text-muted">{item.detail}</p></div>
                  </div>
                </div>;
              })}
            </div>
            <div className="flex items-center justify-between border-t border-line p-3">
              <a href="/app/integrations" className="text-[10px] font-semibold text-accent hover:underline">Manage integration records</a>
              <button onClick={loadConnectedTools} disabled={toolsLoading} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[10px] text-ink hover:bg-surface-subtle disabled:opacity-50"><RefreshCw size={10} className={toolsLoading ? "animate-spin" : ""} /> Refresh</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* -- Panel 1: Session history ---------------------------------------- */}
      <div className="hidden w-[190px] shrink-0 flex-col border-r border-line bg-surface xl:flex">
        <div className="px-3 py-3 border-b border-line">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Sessions</span>
          </div>
          <button onClick={startNewChat}
            className="w-full flex items-center gap-1.5 px-2 py-2 rounded-lg bg-accent text-white text-[11px] font-semibold hover:opacity-90 transition-opacity">
            <Plus size={11} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.length === 0 && <p className="text-[10px] text-faint px-3 py-4 text-center">No sessions yet</p>}
          {sessions.map(s => (
            <div key={s.id} onClick={() => openSession(s)}
              className={`group relative px-3 py-2 cursor-pointer transition-colors
                ${activeSessionId === s.id ? "bg-accent-soft" : "hover:bg-surface-subtle"}`}>
              <div className="flex items-start gap-1.5">
                <MessageSquare size={10} className="shrink-0 mt-0.5 text-faint" />
                <span className="text-[11px] text-muted group-hover:text-ink line-clamp-2 leading-snug">{s.title || "Chat"}</span>
              </div>
              <button onClick={e => deleteSession(s.id, e)}
                className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 text-[#525252] hover:text-red-400 transition-all p-0.5 rounded">
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>

        {/* Model selector at bottom of session panel */}
        <div className="border-t border-line p-2 space-y-1">
          <p className="text-[9px] text-faint uppercase tracking-widest px-1 mb-1.5">Model</p>
          {CODING_MODELS.map(m => (
            <button key={m.model} onClick={() => setSelectedModel(m.model)}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors
                ${selectedModel === m.model ? "bg-accent-soft text-accent font-semibold" : "text-muted hover:text-ink hover:bg-surface-subtle"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* -- Panel 2: File explorer ------------------------------------------ */}
      <div className="hidden w-[230px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {/* Repo input */}
        <div className="px-3 py-3 border-b border-line">
          <div className="flex items-center gap-1 mb-2">
            <GitBranch size={11} className="text-muted" />
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Explorer</span>
            {repoLoading && <Loader2 size={10} className="ml-auto text-muted animate-spin" />}
          </div>
          <div className="flex gap-1">
            <input
              value={repoInput}
              onChange={e => setRepoInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setSelectedRepo(repoInput); loadRepo(repoInput); } }}
              placeholder="owner/repo"
              className="flex-1 text-[11px] px-2 py-1.5 bg-surface-subtle border border-line rounded-lg text-ink placeholder:text-faint focus:outline-none focus:border-accent font-mono"
            />
            <button onClick={() => { setSelectedRepo(repoInput); loadRepo(repoInput); }}
              className="px-2 py-1.5 bg-surface-subtle hover:bg-surface-raised rounded-lg transition-colors">
              <RefreshCw size={11} className="text-muted" />
            </button>
          </div>
          {repoError && <p className="text-[10px] text-red-400 mt-1">{repoError}</p>}
          {selectedRepo && !repoLoading && fileTree.length > 0 && (
            <p className="text-[10px] text-faint mt-1 font-mono truncate">{selectedRepo}</p>
          )}
        </div>

        {/* Project + task selector */}
        <div className="px-3 py-2 border-b border-line">
          <select value={selectedProject?.id ?? ""} onChange={e => { const p = projects.find(p => p.id === e.target.value); if (p) selectProject(p); }}
            className="w-full text-[11px] px-2 py-1.5 bg-surface-subtle border border-line rounded-lg text-muted focus:outline-none mb-1">
            <option value="">� Select project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {tasks.length > 0 && (
            <select value={selectedTask?.id ?? ""} onChange={e => { const t = tasks.find(t => t.id === e.target.value); setSelectedTask(t ?? null); }}
              className="w-full text-[11px] px-2 py-1.5 bg-surface-subtle border border-line rounded-lg text-muted focus:outline-none">
              <option value="">� Select task</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          )}
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {fileTree.length === 0 && !repoLoading && (
            <p className="text-[10px] text-faint px-3 py-6 text-center leading-relaxed">Enter a repo name above and press Enter</p>
          )}
          {fileTree.map(node => (
            <TreeNode key={node.path} node={node} depth={0}
              selectedFile={selectedFile} onSelect={selectFile}
              expandedDirs={expandedDirs} toggleDir={toggleDir} />
          ))}
        </div>
      </div>

      {/* -- Panel 3: Code viewer -------------------------------------------- */}
      <div className="hidden min-w-0 flex-1 flex-col border-r border-line bg-canvas md:flex">
        {/* Tab bar */}
        <div className="flex items-center border-b border-line bg-surface shrink-0 h-[38px]">
          {selectedFile ? (
            <div className="flex items-center gap-2 px-4 h-full border-r border-line bg-canvas">
              <span className="text-[11px] text-ink font-mono">{selectedFile.split("/").pop()}</span>
              <button onClick={() => { setSelectedFile(null); setFileContent(""); }}
                className="text-[#525252] hover:text-white transition-colors">
                <X size={11} />
              </button>
            </div>
          ) : (
            <span className="px-4 text-[11px] text-faint">No file open</span>
          )}
          {selectedFile && (
            <span className="ml-2 text-[10px] text-faint font-mono truncate">{selectedFile}</span>
          )}
          {prResult && (
            <a href={prResult} target="_blank" rel="noopener noreferrer"
              className="ml-auto mr-3 flex items-center gap-1.5 text-[10px] text-positive transition-colors">
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
              <div className="w-10 h-10 rounded-xl bg-surface-subtle flex items-center justify-center mb-4">
                <File size={18} className="text-faint" />
              </div>
              <p className="text-[13px] text-muted mb-2">No file selected</p>
              <p className="text-[11px] text-faint max-w-[260px] leading-relaxed">Click any file in the explorer to view its contents. The agent can read and modify open files.</p>
              {recentCommits.length > 0 && (
                <div className="mt-6 text-left w-full max-w-[360px]">
                  <p className="text-[10px] text-[#525252] uppercase tracking-widest mb-2">Recent commits</p>
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
                    <div key={i} className="text-[11px] text-[#525252] font-mono leading-[1.6] h-[20px]">{i + 1}</div>
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
      <div className="flex w-full shrink-0 flex-col bg-surface md:w-[360px] xl:w-[400px] border-l border-line">
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px]">?</span>
            <span className="text-[12px] font-bold text-ink">Agent</span>
            <span className="text-[10px] text-faint">·</span>
            <span className="text-[10px] text-muted">{selectedModel}</span>
          </div>
          {selectedTask && (
            <div className="flex items-center gap-1.5 max-w-[160px]">
              <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <span className="text-[10px] text-muted truncate">{selectedTask.title}</span>
              <button onClick={() => setSelectedTask(null)} className="text-[#525252] hover:text-[#737373] transition-colors shrink-0"><X size={9} /></button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {messages.length === 0 && (
            <div className="pt-8 text-center">
              <p className="text-[12px] text-muted mb-6">Ask about the codebase, request changes, or debug an issue.</p>
              <div className="space-y-2">
                {[
                  "Explain what this file does",
                  "Find all TODOs in this repo",
                  "Fix the bug in the open file",
                  "Implement the selected task",
                ].map(s => (
                  <button key={s} onClick={() => { setInput(s); setTimeout(() => textareaRef.current?.focus(), 0); }}
                    className="w-full text-left text-[11px] text-muted hover:text-ink px-3 py-2 rounded-xl bg-surface-subtle border border-line hover:border-line-strong transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px]
                ${msg.role === "user" ? "bg-accent text-white font-bold" : "bg-surface-subtle text-ink"}`}>
                {msg.role === "user" ? "S" : "?"}
              </div>
              <div className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed max-w-[300px]
                ${msg.role === "user" ? "bg-accent-soft border border-accent/20 text-ink" : "bg-surface-subtle border border-line"}`}>
                {msg.role === "user"
                  ? <p className="text-[13px] text-ink whitespace-pre-wrap">{msg.content}</p>
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
          <div className="mx-3 mb-2 rounded-xl border border-positive/30 bg-surface-subtle overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-line">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-positive" />
                <span className="text-[11px] font-semibold text-positive">{fileChanges.length} file{fileChanges.length > 1 ? "s" : ""} proposed</span>
              </div>
              <button onClick={() => { setFileChanges([]); setPendingPR(null); }}
                className="text-[#525252] hover:text-white transition-colors"><X size={11} /></button>
            </div>
            <div className="px-3 py-2 space-y-0.5">
              {fileChanges.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-positive font-bold">M</span>
                  <span className="text-muted font-mono truncate">{f.path}</span>
                </div>
              ))}
              <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2 text-[10px] text-muted">
                <input type="checkbox" checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)} className="mt-0.5 accent-[#10B981]" />
                <span>I reviewed every proposed file and understand that this creates a branch and pull request. Merge and deployment remain manual.</span>
              </label>
            </div>
            <div className="px-3 py-2 border-t border-line">
              <button onClick={applyChanges} disabled={creatingPR || !selectedRepo || !reviewConfirmed}
                className="w-full py-2 bg-positive text-white text-[11px] font-semibold rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40">
                {creatingPR ? "Creating PR..." : reviewConfirmed ? "Create review PR" : "Review files before creating PR"}
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 shrink-0">
          {jobs[0] && (
            <div className="mb-2 rounded-xl border border-line bg-surface-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Terminal size={12} className="text-accent" />
                  <span className="truncate text-[11px] font-semibold text-ink">Local run</span>
                  <span className={`text-[10px] ${jobs[0].status === "succeeded" ? "text-positive" : jobs[0].status === "failed" ? "text-red-400" : "text-accent"}`}>{jobs[0].status}</span>
                </div>
                {jobs[0].status === "succeeded" && (
                  <button onClick={() => reviewRunnerChanges(jobs[0])} className="text-[10px] font-semibold text-positive hover:opacity-80">Review diff</button>
                )}
              </div>
              {(jobs[0].verification_results ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {jobs[0].verification_results!.map(result => <span key={result.name} className={`rounded px-1.5 py-0.5 text-[9px] ${result.status === "passed" ? "bg-positive/10 text-positive" : result.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-surface text-muted"}`}>{result.name}: {result.status}</span>)}
                </div>
              )}
              {(jobs[0].error || runnerError) && <p className="mt-2 text-[10px] text-red-400">{jobs[0].error || runnerError}</p>}
            </div>
          )}
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
          <div className="bg-surface-subtle border border-line rounded-xl focus-within:border-accent transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={autoResize}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about code, request changes... (Enter to send)"
              rows={2}
              className="w-full bg-transparent text-[13px] text-ink placeholder:text-faint resize-none focus:outline-none px-3 pt-3 leading-relaxed font-mono"
              style={{ maxHeight: "160px", minHeight: "52px" }}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <button onClick={queueLocalJob} disabled={!selectedRepo || !lastUserRequest || queueingJob}
                title="Execute the latest request in an isolated worktree on your PC"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-30">
                {queueingJob ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />} Run on my PC
              </button>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-faint">Shift + Enter for new line</span>
                <button onClick={send} disabled={loading || !input.trim()}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 bg-accent hover:opacity-90 text-white">
                  <Send size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

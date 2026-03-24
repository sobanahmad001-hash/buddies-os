"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Send, Check, Copy, X, Plus, Trash2, MessageSquare,
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  GitBranch, RefreshCw, ExternalLink, AlertCircle, Loader2,
  PlayCircle, Ban, Terminal as TerminalIcon, CheckCircle2, XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// -- Types ---------------------------------------------------------------------
type Project  = { id: string; name: string; status: string };
type Integration = { id: string; type: string; name: string; config: any };
type Task     = { id: string; title: string; description?: string; status: string; priority: number };
type Message  = { role: "user" | "assistant"; content: string; ts?: string };
type Session  = { id: string; title: string; created_at: string };
type FileNode = { path: string; type: "blob" | "tree"; name: string; children?: FileNode[] };
type RunCommand = {
  id: string; cmd: string; cwd: string; description: string;
  status: "pending" | "running" | "done" | "failed" | "declined";
  output?: string; exitCode?: number; msgTs?: string;
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
          path: fullPath, name: part,
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
    if (name.endsWith(".ts")  || name.endsWith(".js"))  return <span className="text-[#E5C07B] text-[10px]">TS</span>;
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

// -- Command Approval Card ---------------------------------------------------
function CommandApprovalCard({ block, onApprove, onDecline }: {
  block: RunCommand;
  onApprove: (id: string, cmd: string, cwd: string) => void;
  onDecline: (id: string) => void;
}) {
  const [showOutput, setShowOutput] = useState(false);
  return (
    <div className="ml-8 my-1 rounded-lg border border-[#2D2D2D] bg-[#0D0D0D] overflow-hidden text-[11px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1E1E1E] bg-[#161616]">
        <TerminalIcon size={11} className="text-[#525252] shrink-0" />
        <span className="text-[#737373] truncate flex-1">{block.description || "Run command"}</span>
        {block.status === "running"  && <Loader2     size={10} className="text-[#737373] animate-spin shrink-0" />}
        {block.status === "done"     && <CheckCircle2 size={10} className="text-[#10B981] shrink-0" />}
        {block.status === "failed"   && <XCircle      size={10} className="text-red-400 shrink-0" />}
        {block.status === "declined" && <Ban          size={10} className="text-[#525252] shrink-0" />}
      </div>

      <div className="px-3 py-2 font-mono text-[12px] text-[#E5C07B] bg-[#0A0A0A]">
        <span className="text-[#525252]">$ </span>{block.cmd}
        {block.cwd && block.cwd !== "." && (
          <span className="ml-2 text-[9px] text-[#525252]">in {block.cwd}</span>
        )}
      </div>

      {block.status === "pending" && (
        <div className="flex gap-2 px-3 py-2 border-t border-[#1E1E1E]">
          <button
            onClick={() => onApprove(block.id, block.cmd, block.cwd)}
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#10B98120] border border-[#10B98140] text-[#10B981] hover:bg-[#10B98130] transition-colors font-semibold">
            <PlayCircle size={10} /> Run
          </button>
          <button
            onClick={() => onDecline(block.id)}
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#1E1E1E] border border-[#2D2D2D] text-[#525252] hover:text-[#737373] transition-colors">
            <Ban size={10} /> Decline
          </button>
        </div>
      )}
      {block.status === "running" && (
        <div className="px-3 py-2 border-t border-[#1E1E1E] flex items-center gap-2 text-[#525252]">
          <Loader2 size={10} className="animate-spin" /><span>Running...</span>
        </div>
      )}
      {(block.status === "done" || block.status === "failed") && block.output && (
        <div className="border-t border-[#1E1E1E]">
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-[#525252] hover:text-[#737373] transition-colors">
            <span>Output (exit {block.exitCode ?? "?"})</span>
            {showOutput ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
          {showOutput && (
            <pre className={`px-3 pb-3 text-[11px] font-mono overflow-x-auto max-h-[200px] overflow-y-auto leading-relaxed
              ${block.status === "failed" ? "text-red-400" : "text-[#98C379]"}`}>
              {block.output}
            </pre>
          )}
        </div>
      )}
      {block.status === "declined" && (
        <div className="px-3 py-2 border-t border-[#1E1E1E] text-[#525252] italic">Declined</div>
      )}
    </div>
  );
}

// -- Main Component ------------------------------------------------------------
export default function ProjectCodePage() {
  const params = useParams();
  const projectId = params.id as string;

  // Project (loaded from params — no picker needed)
  const [project, setProject] = useState<Project | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
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
  const [selectedModel, setSelectedModel] = useState<"gpt-4.1" | "claude-sonnet-4-5">("gpt-4.1");

  // Images
  const [attachedImages, setAttachedImages] = useState<File[]>([]);

  // Command execution
  const [cmdBlocks, setCmdBlocks] = useState<Record<string, RunCommand>>({});

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentType = `coding_agent_${projectId}`;

  useEffect(() => { init(); loadSessions(); }, [projectId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

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

    const [{ data: proj }, { data: integ }, { data: taskData }] = await Promise.all([
      supabase.from("projects").select("id, name, status").eq("id", projectId).eq("user_id", user.id).single(),
      supabase.from("integrations").select("*").eq("user_id", user.id).eq("status", "active").eq("type", "github"),
      supabase.from("project_tasks").select("id, title, description, status, priority")
        .eq("project_id", projectId).neq("status", "cancelled").neq("status", "done").order("priority"),
    ]);

    setProject(proj ?? null);
    setIntegrations(integ ?? []);
    setTasks(taskData ?? []);

    // Auto-load first GitHub repo linked to this integration
    const firstRepo = integ?.[0]?.config?.repo_url
      ?.replace(/^https?:\/\/github\.com\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "") ?? "";
    if (firstRepo) {
      setRepoInput(firstRepo);
      setSelectedRepo(firstRepo);
      loadRepo(firstRepo, integ?.[0]);
    }
  }

  async function loadSessions() {
    const res = await fetch(`/api/ai/sessions?agent_type=${agentType}`);
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

      if (!treeRes.ok) { setRepoError("Could not load repo — check name and permissions."); setRepoLoading(false); return; }

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
        if (data.encoding === "base64") setFileContent(atob(data.content.replace(/\n/g, "")));
      }
    } catch {}
    setFileLoading(false);
  }

  async function findRelevantFile(message: string): Promise<string | null> {
    if (!fileTree.length) return null;
    const msg = message.toLowerCase();
    function flattenTree(nodes: FileNode[]): string[] {
      const paths: string[] = [];
      for (const n of nodes) {
        if (n.type === "blob") paths.push(n.path);
        if (n.children) paths.push(...flattenTree(n.children));
      }
      return paths;
    }
    const allPaths = flattenTree(fileTree);
    const scored = allPaths.map(path => {
      const parts = path.toLowerCase().split("/");
      const filename = parts[parts.length - 1].replace(/\.tsx?$/, "").replace(/[-_]/g, " ");
      let score = 0;
      if (msg.includes(filename)) score += 10;
      parts.forEach(p => { if (msg.includes(p.replace(/[-_]/g, " "))) score += 3; });
      if (msg.includes("route") && path.includes("route.ts")) score += 5;
      if (msg.includes("action") && path.includes("action")) score += 5;
      if (msg.includes("api") && path.includes("api")) score += 2;
      if ((msg.includes("error") || msg.includes("bug") || msg.includes("fix")) && path.endsWith("route.ts")) score += 2;
      return { path, score };
    });
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 3 ? best.path : null;
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    const newMsg: Message = { role: "user", content: userMsg, ts: new Date().toISOString() };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);

    if (!selectedFile && fileTree.length > 0) {
      const relevantPath = await findRelevantFile(userMsg);
      if (relevantPath) {
        await selectFile(relevantPath);
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
    if (project)      contextParts.push(`Project: ${project.name} (${project.status})`);
    if (selectedTask) contextParts.push(`Active task:\n${selectedTask.title}\n${selectedTask.description ?? ""}`);
    if (selectedRepo) contextParts.push(`Repository: ${selectedRepo}`);
    if (selectedFile && fileContent) {
      contextParts.push(`FILE OPEN: ${selectedFile}\n\`\`\`\n${fileContent.slice(0, 4000)}${fileContent.length > 4000 ? "\n... (truncated)" : ""}\n\`\`\``);
    } else if (selectedFile) {
      contextParts.push(`File selected: ${selectedFile} (loading...)`);
    }
    if (recentCommits.length > 0) contextParts.push(`Recent commits:\n${recentCommits.slice(0, 3).join("\n")}`);

    const systemPrompt = `You are a senior software engineer and coding agent for Buddies OS.

${contextParts.join("\n\n")}

FILE EXPLORER CONTEXT:
- The user can see the file tree on the left and view any file in the center panel
- When they ask about a file or function, assume they may have it open
- Reference specific file paths when making suggestions

PROACTIVE FILE AWARENESS:
- If the user describes a bug or feature and you can identify the relevant file from the repo structure, name it explicitly.
- If a FILE OPEN section is present above, use it as your primary source of truth. Reference specific line numbers and function names.

RULES:
- Write production-quality code only. No TODOs, no placeholders.
- Always specify the exact file path before any code block.
- When proposing file changes, use EXACTLY this format:
  [FILE_CHANGE]
  {"path": "src/exact/path/file.ts", "content": "// complete file content here", "description": "What this fixes"}
  [/FILE_CHANGE]
- CRITICAL: Content between [FILE_CHANGE] tags must be raw JSON only. No markdown fences.
- Multiple FILE_CHANGE blocks are supported — one per file.
- After FILE_CHANGE blocks say: "Ready to apply — click Apply Changes below."
- For PR creation: [CREATE_PR] title="..." branch="fix/..." body="..."
- When a shell command needs to run, use EXACTLY this format:
  [RUN_COMMAND]
  {"cmd": "npm install", "cwd": ".", "description": "Install dependencies"}
  [/RUN_COMMAND]
  The user must approve before it executes. One command per block. Use for: package installs, git ops, builds, test runs, scripts.
- Be surgical — only change what needs changing.`;

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
      const reply = data.response ?? "No response.";

      // Parse FILE_CHANGE blocks
      const fileChangeRegex = /\[FILE_CHANGE\]\s*([\s\S]*?)\s*\[\/FILE_CHANGE\]/g;
      const newChanges: Array<{path: string; content: string; description: string}> = [];
      let match;
      while ((match = fileChangeRegex.exec(reply)) !== null) {
        try {
          const raw = match[1].replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          const parsed = JSON.parse(raw);
          if (parsed.path && parsed.content) newChanges.push(parsed);
        } catch {}
      }
      if (newChanges.length > 0) setFileChanges(prev => [...prev, ...newChanges]);

      const prMatch = reply.match(/\[CREATE_PR\][^\n]*title="([^"]+)"[^\n]*branch="([^"]+)"(?:[^\n]*body="([^"]*)")?/s);
      if (prMatch) setPendingPR({ title: prMatch[1], branch: prMatch[2], body: prMatch[3] ?? "" });

      // Parse RUN_COMMAND blocks
      const assistantTs = new Date().toISOString();
      const runCmdRegex = /\[RUN_COMMAND\]\s*([\s\S]*?)\s*\[\/RUN_COMMAND\]/g;
      const newCmdBlocks: Record<string, RunCommand> = {};
      let cmdMatch;
      let cmdIdx = 0;
      while ((cmdMatch = runCmdRegex.exec(reply)) !== null) {
        try {
          const raw = cmdMatch[1].replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
          const parsed = JSON.parse(raw);
          if (parsed.cmd) {
            const id = `cmd-${Date.now()}-${cmdIdx++}`;
            newCmdBlocks[id] = {
              id, cmd: parsed.cmd, cwd: parsed.cwd ?? ".",
              description: parsed.description ?? "", status: "pending", msgTs: assistantTs,
            };
          }
        } catch {}
      }
      if (Object.keys(newCmdBlocks).length > 0) setCmdBlocks(prev => ({ ...prev, ...newCmdBlocks }));

      const cleanReply = reply
        .replace(/\[FILE_CHANGE\][\s\S]*?\[\/FILE_CHANGE\]/g, "")
        .replace(/\[RUN_COMMAND\][\s\S]*?\[\/RUN_COMMAND\]/g, "")
        .replace(/\[CREATE_PR\][^\n]*/g, "")
        .trim();

      const assistantMsg: Message = { role: "assistant", content: cleanReply || reply, ts: assistantTs };
      setMessages(prev => [...prev, assistantMsg]);
      const updatedMessages = [...messages, newMsg, assistantMsg];

      try {
        if (activeSessionId) {
          await fetch("/api/ai/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: activeSessionId, messages: updatedMessages, agent_type: agentType }),
          });
        } else {
          const saveRes = await fetch("/api/ai/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: userMsg.slice(0, 50), messages: updatedMessages, agent_type: agentType }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            if (saveData?.sessionId) setActiveSessionId(saveData.sessionId);
          }
        }
        await loadSessions();
      } catch {}
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again." }]);
    }
    setLoading(false);
  }

  async function applyChanges() {
    if (!fileChanges.length || !selectedRepo) return;
    setCreatingPR(true);
    const branch = pendingPR?.branch ?? `fix/buddies-${Date.now()}`;
    const title  = pendingPR?.title  ?? "Fix from Buddies Coding Agent";

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
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `✅ PR created — ${data.files_written?.length ?? 0} file(s) changed.\n\nView PR: ${data.pr_url}\n\nMerge to deploy via Vercel.`,
      }]);
      setFileChanges([]);
      setPendingPR(null);
    } else {
      setMessages(prev => [...prev, { role: "assistant", content: `❌ PR failed: ${data.error}` }]);
    }
    setCreatingPR(false);
  }

  async function approveCommand(id: string, cmd: string, cwd: string) {
    setCmdBlocks(prev => ({ ...prev, [id]: { ...prev[id], status: "running" } }));
    try {
      const res = await fetch("/api/coding-agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, cwd }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const output = [data.stdout, data.stderr].filter(Boolean).join("\n").trim() || "(no output)";
      const status = data.exitCode === 0 ? "done" : "failed";
      setCmdBlocks(prev => ({ ...prev, [id]: { ...prev[id], status, output, exitCode: data.exitCode } }));
      setMessages(prev => [...prev, {
        role: "assistant" as const,
        content: `**$ ${cmd}**\n\`\`\`\n${output}\n\`\`\``,
        ts: new Date().toISOString(),
      }]);
    } catch (err: any) {
      setCmdBlocks(prev => ({ ...prev, [id]: { ...prev[id], status: "failed", output: err.message ?? "Connection error" } }));
    }
  }

  function declineCommand(id: string) {
    setCmdBlocks(prev => ({ ...prev, [id]: { ...prev[id], status: "declined" } }));
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  const CODING_MODELS = [
    { model: "gpt-4.1"          as const, label: "GPT-4.1",    provider: "openai"    },
    { model: "claude-sonnet-4-5" as const, label: "Sonnet 4.5", provider: "anthropic" },
  ];

  return (
    <div className="flex h-full bg-[#0D0D0D] text-white overflow-hidden">

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
          {sessions.length === 0 && <p className="text-[10px] text-[#525252] px-3 py-4 text-center">No sessions yet</p>}
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

        {/* Model selector */}
        <div className="border-t border-[#1E1E1E] p-2 space-y-1">
          <p className="text-[9px] text-[#525252] uppercase tracking-widest px-1 mb-1.5">Model</p>
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
              className="flex-1 text-[11px] px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[#B0ADA9] placeholder:text-[#525252] focus:outline-none focus:border-[#B5622A] font-mono"
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

        {/* Task selector — project tasks loaded automatically */}
        {tasks.length > 0 && (
          <div className="px-3 py-2 border-b border-[#1E1E1E]">
            <p className="text-[9px] text-[#525252] uppercase tracking-widest mb-1.5">Active task</p>
            <select
              value={selectedTask?.id ?? ""}
              onChange={e => { const t = tasks.find(t => t.id === e.target.value); setSelectedTask(t ?? null); }}
              className="w-full text-[11px] px-2 py-1.5 bg-[#0D0D0D] border border-[#2D2D2D] rounded text-[#737373] focus:outline-none">
              <option value="">— Select task</option>
              {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )}

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {fileTree.length === 0 && !repoLoading && (
            <p className="text-[10px] text-[#525252] px-3 py-6 text-center leading-relaxed">
              Enter a repo name above and press Enter
            </p>
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
            <span className="px-4 text-[11px] text-[#525252]">No file open</span>
          )}
          {selectedFile && <span className="ml-2 text-[10px] text-[#525252] font-mono truncate">{selectedFile}</span>}
          {prResult && (
            <a href={prResult} target="_blank" rel="noopener noreferrer"
              className="ml-auto mr-3 flex items-center gap-1.5 text-[10px] text-[#10B981] hover:text-[#34D399] transition-colors">
              <ExternalLink size={10} /> View PR
            </a>
          )}
        </div>

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
              <p className="text-[11px] text-[#525252] max-w-[260px] leading-relaxed">
                Click any file in the explorer to view its contents.
              </p>
              {recentCommits.length > 0 && (
                <div className="mt-6 text-left w-full max-w-[360px]">
                  <p className="text-[10px] text-[#525252] uppercase tracking-widest mb-2">Recent commits</p>
                  {recentCommits.map((c, i) => (
                    <p key={i} className="text-[11px] text-[#525252] font-mono py-0.5 truncate">· {c}</p>
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
      <div className="w-[380px] shrink-0 flex flex-col bg-[#111111] border-l border-[#1E1E1E]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E1E] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px]">⚡</span>
            <span className="text-[12px] font-bold text-[#B0ADA9]">Coding Agent</span>
            <span className="text-[10px] text-[#525252]">·</span>
            <span className="text-[10px] text-[#525252]">{selectedModel}</span>
          </div>
          {selectedTask && (
            <div className="flex items-center gap-1.5 max-w-[160px]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#B5622A] shrink-0" />
              <span className="text-[10px] text-[#737373] truncate">{selectedTask.title}</span>
              <button onClick={() => setSelectedTask(null)} className="text-[#525252] hover:text-[#737373] transition-colors shrink-0">
                <X size={9} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {messages.length === 0 && (
            <div className="pt-8 text-center">
              <p className="text-[12px] text-[#525252] mb-6">
                Ask me about the codebase, request changes, or debug issues.
              </p>
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

          {messages.flatMap((msg, i) => {
            const msgCmds = msg.role === "assistant" && msg.ts
              ? Object.values(cmdBlocks).filter(b => b.msgTs === msg.ts)
              : [];
            return [
              <div key={`msg-${i}`} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px]
                  ${msg.role === "user" ? "bg-[#B5622A] text-white font-bold" : "bg-[#1E1E1E] text-white"}`}>
                  {msg.role === "user" ? "U" : "⚡"}
                </div>
                <div className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed max-w-[300px]
                  ${msg.role === "user" ? "bg-[#B5622A15] border border-[#B5622A30] text-[#C8C5C0]" : "bg-[#161616] border border-[#1E1E1E]"}`}>
                  {msg.role === "user"
                    ? <p className="text-[13px] text-[#C8C5C0] whitespace-pre-wrap">{msg.content}</p>
                    : <div>{renderMessage(msg.content)}</div>
                  }
                </div>
              </div>,
              ...msgCmds.map(block => (
                <CommandApprovalCard
                  key={block.id}
                  block={block}
                  onApprove={approveCommand}
                  onDecline={declineCommand}
                />
              )),
            ];
          })}

          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-[#1E1E1E] flex items-center justify-center shrink-0 text-[11px]">⚡</div>
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
                <span className="text-[11px] font-semibold text-[#10B981]">
                  {fileChanges.length} file{fileChanges.length > 1 ? "s" : ""} to apply
                </span>
              </div>
              <button onClick={() => { setFileChanges([]); setPendingPR(null); }}
                className="text-[#525252] hover:text-white transition-colors">
                <X size={11} />
              </button>
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
              {!selectedRepo && (
                <p className="text-[10px] text-[#737373] text-center mt-1">Enter a repo above to apply changes</p>
              )}
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
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px]">×</button>
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
              className="w-full bg-transparent text-[13px] text-[#C8C5C0] placeholder:text-[#525252] resize-none focus:outline-none px-3 pt-3 leading-relaxed font-mono"
              style={{ maxHeight: "160px", minHeight: "52px" }}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <span className="text-[10px] text-[#525252]">⇧↵ new line</span>
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

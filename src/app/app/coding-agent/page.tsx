"use client";
import { useEffect, useState, useRef } from "react";
import { Send, GitBranch, Plus, Check, ChevronDown, ExternalLink, Copy, X, MessageSquare, Trash2, PanelLeftClose } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = { id: string; name: string; status: string };
type Integration = { id: string; type: string; name: string; config: any; status: string };
type Task = { id: string; title: string; description?: string; status: string; priority: number };
type Message = { role: "user" | "assistant"; content: string };

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#2D2D2D]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A]">
        <span className="text-[11px] text-[#737373] font-mono uppercase">{lang || "code"}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-white transition-colors">
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="bg-[#2D2D2D] text-[#E5E2DE] text-[13px] font-mono p-4 overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

function renderMessage(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const lines = part.slice(3, -3).split("\n");
      const lang = lines[0].trim();
      const code = lines.slice(1).join("\n");
      return <CodeBlock key={i} code={code} lang={lang} />;
    }
    return <p key={i} className="text-[14px] leading-relaxed whitespace-pre-wrap">{part}</p>;
  });
}

const CODING_MODELS = [
  { provider: "anthropic", model: "claude-sonnet-4-5", label: "Claude Sonnet", badge: "Best for code" },
  { provider: "openai",    model: "gpt-4o",            label: "GPT-4o",        badge: "Alternative" },
] as const;

export default function CodingAgentPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [repoContext, setRepoContext] = useState<any>(null);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [prResult, setPrResult] = useState<string | null>(null);
  const [fileChanges, setFileChanges] = useState<Array<{path: string; content: string; description: string}>>([]);
  const [vercelErrors, setVercelErrors] = useState<any[]>([]);
  const [creatingPR, setCreatingPR] = useState(false);
  const [pendingPR, setPendingPR] = useState<{title: string; branch: string; body: string} | null>(null);
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [sessions, setSessions] = useState<Array<{id: string; title: string; created_at: string; agent_type?: string}>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-5");
  const [selectedProvider, setSelectedProvider] = useState<"anthropic" | "openai">("anthropic");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { init(); loadVercelErrors(); loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter(item => item.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      const files = imageItems.map(item => item.getAsFile()).filter(Boolean) as File[];
      setAttachedImages(prev => [...prev, ...files]);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
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
  }

  async function loadSessions() {
    const res = await fetch("/api/ai/sessions?agent_type=coding_agent");
    if (!res.ok) return;
    const { sessions: data } = await res.json();
    setSessions(data ?? []);
  }

  async function openSession(session: {id: string; title: string; created_at: string}) {
    setActiveSessionId(session.id);
    const res = await fetch(`/api/ai/sessions?id=${session.id}`);
    if (res.ok) {
      const { session: data } = await res.json();
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(msgs);
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
  }

  async function selectProject(project: Project) {
    setSelectedProject(project);
    setSelectedTask(null);
    const { data } = await supabase.from("project_tasks")
      .select("id, title, description, status, priority")
      .eq("project_id", project.id)
      .neq("status", "cancelled")
      .order("priority");
    setTasks(data ?? []);
  }

  async function loadRepoContext(repoName: string) {
    if (!repoName) return;
    setLoadingRepo(true);
    const integration = integrations[0];
    if (!integration?.config?.access_token) { setLoadingRepo(false); return; }

    const ghHeaders = {
      Authorization: `token ${integration.config.access_token}`,
      Accept: "application/vnd.github.v3+json",
    };

    try {
      const [treeRes, commitsRes, issuesRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repoName}/git/trees/HEAD?recursive=0`, { headers: ghHeaders }),
        fetch(`https://api.github.com/repos/${repoName}/commits?per_page=5`, { headers: ghHeaders }),
        fetch(`https://api.github.com/repos/${repoName}/issues?state=open&per_page=5`, { headers: ghHeaders }),
      ]);

      const [tree, commits, issues] = await Promise.all([
        treeRes.ok ? treeRes.json() : null,
        commitsRes.ok ? commitsRes.json() : null,
        issuesRes.ok ? issuesRes.json() : null,
      ]);

      setRepoContext({
        repoName,
        files: (tree?.tree ?? []).slice(0, 50).map((f: any) => f.path),
        commits: (commits ?? []).slice(0, 5).map((c: any) => c.commit?.message?.split("\n")[0]),
        issues: (issues ?? []).filter((i: any) => !i.pull_request).slice(0, 5).map((i: any) => `#${i.number}: ${i.title}`),
      });
    } catch {}
    setLoadingRepo(false);
  }

  async function loadVercelErrors() {
    const res = await fetch("/api/integrations/vercel/logs");
    if (res.ok) {
      const data = await res.json();
      setVercelErrors(data.logs ?? []);
    }
  }

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    const imageUrls: string[] = [];
    for (const img of attachedImages) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(img);
      });
      imageUrls.push(dataUrl);
    }
    setAttachedImages([]);

    const contextParts = [];
    if (selectedProject) contextParts.push(`Working on project: ${selectedProject.name}`);
    if (selectedTask) contextParts.push(`Task:\nTitle: ${selectedTask.title}\nDescription: ${selectedTask.description ?? "n/a"}`);
    if (repoContext) {
      contextParts.push(`Repository: ${repoContext.repoName}`);
      contextParts.push(`Files:\n${repoContext.files.slice(0, 40).join("\n")}`);
      contextParts.push(`Recent commits:\n${repoContext.commits.join("\n")}`);
    }
    // Auto-inject Vercel errors when debugging
    const isDebugging = /error|bug|broken|fix|debug|failing|crash|issue/i.test(userMsg);
    if (isDebugging && vercelErrors.length > 0) {
      contextParts.push(`RECENT VERCEL ERRORS (auto-injected):\n${vercelErrors.slice(0, 5).map(e => `[${e.function_path ?? "unknown"}] ${e.message?.slice(0, 300)}`).join("\n")}`);
    }

    const systemPrompt = `You are a coding agent for Buddies OS. You implement features, fix bugs, and create GitHub PRs with actual file changes.

${contextParts.join("\n\n")}

RULES:
- Write production-quality code. No placeholders or TODOs.
- Always specify exact file path before showing code.
- When you have a complete fix ready, output it as a FILE_CHANGE block:

[FILE_CHANGE]
{"path": "src/app/api/example/route.ts", "content": "// full file content here", "description": "Fix priority coercion bug"}
[/FILE_CHANGE]

- You can output multiple FILE_CHANGE blocks for multi-file fixes.
- After outputting FILE_CHANGE blocks, say "Ready to create PR — click Apply Changes below."
- For PR creation signal use: [CREATE_PR] title="..." branch="fix/..." body="..."
- Be surgical. Only change what needs changing.
- When debugging, read the Vercel errors above carefully before proposing a fix.`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-12),
          provider: selectedProvider,
          model: selectedModel,
          contextEnabled: false,
          images: imageUrls.length > 0 ? imageUrls : undefined,
        }),
      });
      const data = await res.json();
      const reply = data.response ?? data.reply ?? "Error";

      // Parse FILE_CHANGE blocks
      const fileChangeRegex = /\[FILE_CHANGE\]\s*([\s\S]*?)\s*\[\/FILE_CHANGE\]/g;
      const newFileChanges: Array<{path: string; content: string; description: string}> = [];
      let match;
      while ((match = fileChangeRegex.exec(reply)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.path && parsed.content) newFileChanges.push(parsed);
        } catch {}
      }
      if (newFileChanges.length > 0) setFileChanges(newFileChanges);

      // Parse CREATE_PR signal
      const prMatch = reply.match(/\[CREATE_PR\]\s*title="([^"]+)"\s*branch="([^"]+)"(?:\s*body="([^"]*)")?/);
      if (prMatch && repoContext) {
        setPendingPR({ title: prMatch[1], branch: prMatch[2], body: prMatch[3] ?? "" });
      }

      const cleanReply = reply
        .replace(/\[FILE_CHANGE\][\s\S]*?\[\/FILE_CHANGE\]/g, "")
        .replace(/\[CREATE_PR\][^\n]*/g, "")
        .trim();

      const updatedMessages = [...messages, { role: "user" as const, content: userMsg }, { role: "assistant" as const, content: cleanReply || reply }];
      setMessages(prev => [...prev, { role: "assistant", content: cleanReply || reply }]);

      // Persist session
      if (activeSessionId) {
        await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: activeSessionId, messages: updatedMessages, agent_type: "coding_agent" }),
        }).catch(() => {});
      } else {
        const saveRes = await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: userMsg.slice(0, 50), messages: updatedMessages, agent_type: "coding_agent" }),
        }).catch(() => null);
        if (saveRes?.ok) {
          const { sessionId } = await saveRes.json();
          if (sessionId) setActiveSessionId(sessionId);
        }
      }
      await loadSessions();
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error getting response." }]);
    }
    setLoading(false);
  }

  async function applyChanges() {
    if (!fileChanges.length || !repoContext || !pendingPR) return;
    setCreatingPR(true);

    const res = await fetch("/api/coding-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_pr_with_files",
        repo: repoContext.repoName,
        branch: pendingPR.branch,
        files: fileChanges,
        prTitle: pendingPR.title,
        prBody: pendingPR.body,
        taskId: selectedTask?.id ?? null,
      }),
    });

    const data = await res.json();
    if (data.pr_url) {
      setPrResult(data.pr_url);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `✅ PR created with ${data.files_written?.length ?? 0} file(s) changed.\n\n[View PR](${data.pr_url})\n\nFiles: ${data.files_written?.join(", ")}\n\nMerge when ready — Vercel will deploy automatically.`
      }]);
      setFileChanges([]);
      setPendingPR(null);
    } else {
      setMessages(prev => [...prev, { role: "assistant", content: `❌ PR failed: ${data.error}` }]);
    }
    setCreatingPR(false);
  }

  const githubIntegration = integrations[0];
  const repoName = githubIntegration?.config?.repo_url
    ? githubIntegration.config.repo_url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "")
    : "";

  return (
    <div className="flex h-full bg-[#F7F5F2]">

      {/* Session history sidebar */}
      {sessionSidebarOpen && (
        <div className="w-[200px] bg-[#1A1A1A] text-white flex flex-col shrink-0 border-r border-[#2D2D2D]">
          <div className="px-3 py-3 border-b border-[#2D2D2D] flex items-center justify-between">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">History</span>
          </div>
          <button onClick={startNewChat}
            className="mx-2 mt-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#B5622A] text-white text-[11px] font-semibold hover:bg-[#9A4E20] transition-colors">
            <Plus size={12} /> New Chat
          </button>
          <div className="flex-1 overflow-y-auto py-2">
            {sessions.length === 0 && (
              <p className="text-[10px] text-white/20 px-3 py-4">No sessions yet</p>
            )}
            {sessions.map(s => (
              <div key={s.id} onClick={() => openSession(s)}
                className={`group relative mx-2 mb-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all
                  ${activeSessionId === s.id ? "bg-[#2D2D2D] text-white" : "text-white/40 hover:bg-[#252525] hover:text-white/70"}`}>
                <div className="flex items-start gap-2">
                  <MessageSquare size={11} className="shrink-0 mt-0.5 opacity-60" />
                  <span className="text-[11px] leading-snug line-clamp-2">{s.title || "Chat"}</span>
                </div>
                <button onClick={e => deleteSession(s.id, e)}
                  className="absolute right-1.5 top-2 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all p-0.5 rounded">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Left sidebar — project/repo/task context */}
      <div className="w-[260px] bg-[#0F0F0F] text-white flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-[#1E1E1E]">
          <div className="flex items-center gap-2">
            <button onClick={() => setSessionSidebarOpen(v => !v)}
              className="flex flex-col justify-center items-center w-6 h-6 gap-1 text-white/30 hover:text-white transition-colors shrink-0">
              <span className="w-3.5 h-0.5 bg-current rounded-full" />
              <span className="w-3.5 h-0.5 bg-current rounded-full" />
              <span className="w-3.5 h-0.5 bg-current rounded-full" />
            </button>
            <span className="text-lg">⚡</span>
            <span className="text-[14px] font-bold">Coding Agent</span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5">Discuss → Plan → Build → PR</p>
        </div>

        {/* Model selector */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1E1E1E]">
          {CODING_MODELS.map(m => (
            <button key={m.model}
              onClick={() => { setSelectedModel(m.model); setSelectedProvider(m.provider as "anthropic" | "openai"); }}
              className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-semibold transition-colors
                ${selectedModel === m.model ? "bg-[#B5622A] text-white" : "text-white/40 hover:text-white hover:bg-[#1E1E1E]"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-b border-[#1E1E1E]">
          <p className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Project</p>
          <select
            value={selectedProject?.id ?? ""}
            onChange={e => {
              const p = projects.find(p => p.id === e.target.value);
              if (p) selectProject(p);
            }}
            className="w-full text-xs px-2 py-2 bg-[#1E1E1E] text-white rounded-lg border border-[#2D2D2D] focus:outline-none"
          >
            <option value="">Select project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Repo */}
        <div className="px-4 py-3 border-b border-[#1E1E1E]">
          <p className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Repository</p>
          {githubIntegration ? (
            <div>
              <div className="text-[11px] text-[#10B981] mb-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                GitHub connected
              </div>
              <input
                value={selectedRepo}
                onChange={e => setSelectedRepo(e.target.value)}
                onBlur={e => e.target.value && loadRepoContext(e.target.value)}
                placeholder={repoName || "owner/repo"}
                className="w-full text-xs px-2 py-2 bg-[#1E1E1E] text-white rounded-lg border border-[#2D2D2D] focus:outline-none focus:border-[#B5622A] placeholder:text-white/20"
              />
              {repoName && !selectedRepo && (
                <button onClick={() => { setSelectedRepo(repoName); loadRepoContext(repoName); }}
                  className="mt-1.5 text-[10px] text-white/40 hover:text-[#B5622A] transition-colors">
                  Use {repoName} →
                </button>
              )}
              {loadingRepo && <p className="text-[10px] text-white/40 mt-1">Loading repo context...</p>}
              {repoContext && <p className="text-[10px] text-[#10B981] mt-1">✓ {repoContext.files.length} files loaded</p>}
            </div>
          ) : (
            <p className="text-[11px] text-white/40">Connect GitHub in Integrations to enable repo context.</p>
          )}
        </div>

        {/* Tasks from selected project */}
        {tasks.length > 0 && (
          <div className="px-4 py-3 flex-1 overflow-y-auto">
            <p className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Tasks</p>
            <div className="space-y-1">
              {tasks.filter(t => t.status !== "done").map(t => (
                <button key={t.id} onClick={() => setSelectedTask(selectedTask?.id === t.id ? null : t)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] transition-colors
                    ${selectedTask?.id === t.id ? "bg-[#B5622A] text-white" : "text-white/60 hover:bg-[#1E1E1E] hover:text-white"}`}>
                  <div className="truncate">{t.title}</div>
                  <div className={`text-[9px] mt-0.5 ${selectedTask?.id === t.id ? "text-white/60" : "text-white/30"}`}>
                    {t.status} · P{t.priority}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedTask && (
          <div className="px-4 py-3 border-t border-[#1E1E1E] bg-[#B5622A10]">
            <p className="text-[10px] text-[#B5622A] uppercase tracking-wide mb-1">Active Task</p>
            <p className="text-[11px] text-white line-clamp-2">{selectedTask.title}</p>
            <button onClick={() => setSelectedTask(null)} className="text-[10px] text-white/30 hover:text-white mt-1">Clear</button>
          </div>
        )}

        {prResult && (
          <div className="px-4 py-3 border-t border-[#1E1E1E] bg-[#10B98110]">
            <p className="text-[10px] text-[#10B981] uppercase tracking-wide mb-1">Latest PR</p>
            <a href={prResult} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-[#10B981] hover:underline flex items-center gap-1">
              View PR <ExternalLink size={9} />
            </a>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {/* Repo context bar */}
        {repoContext && (
          <div className="px-4 py-2 bg-[#1A1A1A] text-[11px] text-white/50 flex items-center gap-3 shrink-0">
            <GitBranch size={11} />
            <span>{repoContext.repoName}</span>
            <span>·</span>
            <span>{repoContext.files.length} files</span>
            <span>·</span>
            <span>{repoContext.commits[0]}</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#0F0F0F] flex items-center justify-center text-2xl mb-4">⚡</div>
              <h2 className="text-[18px] font-bold text-[#1A1A1A] mb-2">Coding Agent</h2>
              <p className="text-[13px] text-[#737373] max-w-[400px] mb-6">
                Select a project and repo, optionally pick a task, then describe what to build.
                Agent reads your codebase and can create GitHub PRs.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-[500px]">
                {[
                  "Implement the selected task",
                  "Review recent commits and suggest improvements",
                  "Add error handling to the auth route",
                  "Write tests for the project tasks API",
                ].map(s => (
                  <button key={s} onClick={() => setInput(s)}
                    className="text-left text-[12px] text-[#737373] bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 hover:border-[#B5622A] hover:text-[#1A1A1A] transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
                ${m.role === "user" ? "bg-[#B5622A] text-white" : "bg-[#0F0F0F] text-white"}`}>
                {m.role === "user" ? "Y" : "⚡"}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-5 py-4
                ${m.role === "user" ? "bg-[#B5622A] text-white" : "bg-white border border-[#E5E2DE]"}`}>
                {m.role === "user"
                  ? <p className="text-[14px] leading-relaxed">{m.content}</p>
                  : <div className="text-[14px] text-[#1A1A1A]">{renderMessage(m.content)}</div>
                }
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[#0F0F0F] flex items-center justify-center text-sm text-white shrink-0">⚡</div>
              <div className="bg-white border border-[#E5E2DE] rounded-2xl px-5 py-4 flex gap-1.5">
                {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-[#B0ADA9] animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* File changes ready to apply */}
        {fileChanges.length > 0 && (
          <div className="mx-6 mb-3 bg-[#1A1A1A] rounded-xl border border-[#10B981] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2D2D2D]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                <span className="text-[12px] font-semibold text-[#10B981]">{fileChanges.length} file{fileChanges.length > 1 ? "s" : ""} ready to apply</span>
              </div>
              <button onClick={() => setFileChanges([])} className="text-[#737373] hover:text-white transition-colors"><X size={13} /></button>
            </div>
            <div className="px-4 py-2 space-y-1">
              {fileChanges.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="text-[#10B981]">+</span>
                  <span className="text-white/70 font-mono">{f.path}</span>
                  {f.description && <span className="text-[#737373]">— {f.description}</span>}
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-[#2D2D2D] flex gap-2">
              <button
                onClick={applyChanges}
                disabled={creatingPR || !repoContext || !pendingPR}
                className="flex-1 py-2 bg-[#10B981] text-white text-[12px] font-semibold rounded-lg hover:bg-[#059669] disabled:opacity-40 transition-colors">
                {creatingPR ? "Creating PR..." : "Apply Changes & Create PR"}
              </button>
              {!pendingPR && (
                <button
                  onClick={() => {
                    const branch = `fix/buddies-agent-${Date.now()}`;
                    setPendingPR({ title: "Fix from Buddies Coding Agent", branch, body: fileChanges.map(f => f.description).join("\n") });
                  }}
                  className="px-4 py-2 bg-[#2D2D2D] text-white/60 text-[12px] rounded-lg hover:bg-[#3D3D3D] transition-colors">
                  Set PR details
                </button>
              )}
            </div>
          </div>
        )}

        {/* Vercel errors strip */}
        {vercelErrors.length > 0 && messages.length === 0 && (
          <div className="mx-6 mb-4 bg-[#FEE2E2] border border-[#FECACA] rounded-xl p-3">
            <p className="text-[11px] font-semibold text-[#DC2626] mb-2">⚠️ {vercelErrors.length} recent error{vercelErrors.length > 1 ? "s" : ""} detected</p>
            {vercelErrors.slice(0, 3).map((e, i) => (
              <div key={i} className="text-[10px] text-[#991B1B] font-mono truncate">{e.function_path}: {e.message?.slice(0, 80)}</div>
            ))}
            <button
              className="mt-2 text-[11px] text-[#DC2626] hover:underline font-semibold"
              onClick={() => { setInput("Debug these Vercel errors and propose fixes"); }}>
              Ask agent to debug →
            </button>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 bg-white border-t border-[#E5E2DE] shrink-0">
          {selectedTask && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-[#FAF5EF] rounded-lg border border-[#B5622A20] text-[11px]">
              <span className="text-[#B5622A] font-semibold">Task:</span>
              <span className="text-[#404040] truncate">{selectedTask.title}</span>
              <button onClick={() => setSelectedTask(null)} className="ml-auto text-[#B0ADA9] hover:text-[#737373]"><X size={11} /></button>
            </div>
          )}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(img)}
                    alt={`Attached ${i + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-[#E5E2DE]"
                  />
                  <button
                    onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#737373] rounded-full flex items-center justify-center text-white hover:bg-[#404040]"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder="Describe what to build, debug, or review... (Enter to send)"
              className="flex-1 resize-none text-[14px] text-[#1A1A1A] border border-[#E5E2DE] rounded-xl px-4 py-3 focus:outline-none focus:border-[#B5622A] leading-relaxed placeholder:text-[#B0ADA9]"
              style={{ maxHeight: "120px" }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-4 bg-[#B5622A] text-white rounded-xl hover:bg-[#9A4E20] disabled:opacity-40 transition-colors self-end py-3">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

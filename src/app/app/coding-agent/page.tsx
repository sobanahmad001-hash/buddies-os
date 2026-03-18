"use client";
import { useEffect, useState, useRef } from "react";
import { Send, GitBranch, Plus, Check, ChevronDown, ExternalLink, Copy, X } from "lucide-react";
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    // Build context for the agent
    const contextParts = [];
    if (selectedProject) contextParts.push(`Working on project: ${selectedProject.name}`);
    if (selectedTask) contextParts.push(`Task to implement:\nTitle: ${selectedTask.title}\nDescription: ${selectedTask.description ?? "n/a"}\nPriority: ${selectedTask.priority}`);
    if (repoContext) {
      contextParts.push(`Repository: ${repoContext.repoName}`);
      contextParts.push(`Files (sample):\n${repoContext.files.slice(0, 30).join("\n")}`);
      contextParts.push(`Recent commits:\n${repoContext.commits.join("\n")}`);
    }

    const systemPrompt = `You are a coding agent for Buddies OS. You help implement features, write code, debug issues, and create GitHub PRs.

${contextParts.join("\n\n")}

RULES:
- Write production-quality code. No placeholders.
- Always specify the exact file path before showing code.
- When implementation is complete, ask if the user wants to create a PR.
- If asked to create a PR, respond with exactly: [CREATE_PR] title="<title>" branch="<branch-name>" body="<description>"
- Be surgical — change only what needs changing.
- Reference the task title in PR descriptions.`;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-12),
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          contextEnabled: false,
          sessionId: null,
        }),
      });
      const data = await res.json();
      const reply = data.response ?? data.reply ?? "Error";

      // Check for PR creation signal
      if (reply.includes("[CREATE_PR]")) {
        const titleMatch = reply.match(/title="([^"]+)"/);
        const branchMatch = reply.match(/branch="([^"]+)"/);
        const bodyMatch = reply.match(/body="([^"]+)"/);
        if (titleMatch && branchMatch && repoContext) {
          await createPR(
            repoContext.repoName,
            titleMatch[1],
            branchMatch[1],
            bodyMatch?.[1] ?? "",
            userMsg
          );
        }
        setMessages(prev => [...prev, { role: "assistant", content: reply.replace(/\[CREATE_PR\][^\n]*/, "").trim() }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error getting response." }]);
    }
    setLoading(false);
  }

  async function createPR(repo: string, title: string, branch: string, body: string, context: string) {
    const integration = integrations[0];
    if (!integration?.config?.access_token) return;

    const headers = {
      Authorization: `token ${integration.config.access_token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    try {
      // Get default branch
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      const repoData = await repoRes.json();
      const defaultBranch = repoData.default_branch ?? "main";

      // Get SHA of default branch
      const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${defaultBranch}`, { headers });
      const refData = await refRes.json();
      const sha = refData.object?.sha;
      if (!sha) return;

      // Create branch
      await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
        method: "POST", headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });

      // Create PR
      const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
        method: "POST", headers,
        body: JSON.stringify({
          title,
          body: `${body}\n\n---\nCreated by Buddies OS Coding Agent${selectedTask ? `\nTask: ${selectedTask.title}` : ""}`,
          head: branch,
          base: defaultBranch,
        }),
      });
      const prData = await prRes.json();

      if (prData.html_url) {
        setPrResult(prData.html_url);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `✅ PR created: [${title}](${prData.html_url})\n\nBranch \`${branch}\` → \`${defaultBranch}\`. Note: you'll need to push the actual code changes to the branch separately, or I can guide you through that.`
        }]);
        // Save PR link back to task if one is selected
        if (selectedTask) {
          await supabase.from("project_tasks").update({
            description: `${selectedTask.description ?? ""}\n\nPR: ${prData.html_url}`,
          }).eq("id", selectedTask.id);
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Failed to create PR. Check GitHub token permissions." }]);
    }
  }

  const githubIntegration = integrations[0];
  const repoName = githubIntegration?.config?.repo_url
    ? githubIntegration.config.repo_url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "")
    : "";

  return (
    <div className="flex h-full bg-[#F7F5F2]">
      {/* Left sidebar */}
      <div className="w-[260px] bg-[#0F0F0F] text-white flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-[#1E1E1E]">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <span className="text-[14px] font-bold">Coding Agent</span>
          </div>
          <p className="text-[11px] text-white/40 mt-0.5">Discuss → Plan → Build → PR</p>
        </div>

        {/* Project selector */}
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
                className="w-full text-xs px-2 py-2 bg-[#1E1E1E] text-white rounded-lg border border-[#2D2D2D] focus:outline-none focus:border-[#E8521A] placeholder:text-white/20"
              />
              {repoName && !selectedRepo && (
                <button onClick={() => { setSelectedRepo(repoName); loadRepoContext(repoName); }}
                  className="mt-1.5 text-[10px] text-white/40 hover:text-[#E8521A] transition-colors">
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
                    ${selectedTask?.id === t.id ? "bg-[#E8521A] text-white" : "text-white/60 hover:bg-[#1E1E1E] hover:text-white"}`}>
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
          <div className="px-4 py-3 border-t border-[#1E1E1E] bg-[#E8521A10]">
            <p className="text-[10px] text-[#E8521A] uppercase tracking-wide mb-1">Active Task</p>
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
                    className="text-left text-[12px] text-[#737373] bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 hover:border-[#E8521A] hover:text-[#1A1A1A] transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
                ${m.role === "user" ? "bg-[#E8521A] text-white" : "bg-[#0F0F0F] text-white"}`}>
                {m.role === "user" ? "Y" : "⚡"}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-5 py-4
                ${m.role === "user" ? "bg-[#E8521A] text-white" : "bg-white border border-[#E5E2DE]"}`}>
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

        {/* Input */}
        <div className="px-6 py-4 bg-white border-t border-[#E5E2DE] shrink-0">
          {selectedTask && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-[#FFF8F5] rounded-lg border border-[#E8521A20] text-[11px]">
              <span className="text-[#E8521A] font-semibold">Task:</span>
              <span className="text-[#404040] truncate">{selectedTask.title}</span>
              <button onClick={() => setSelectedTask(null)} className="ml-auto text-[#B0ADA9] hover:text-[#737373]"><X size={11} /></button>
            </div>
          )}
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder="Describe what to build, debug, or review... (Enter to send)"
              className="flex-1 resize-none text-[14px] text-[#1A1A1A] border border-[#E5E2DE] rounded-xl px-4 py-3 focus:outline-none focus:border-[#E8521A] leading-relaxed placeholder:text-[#B0ADA9]"
              style={{ maxHeight: "120px" }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-4 bg-[#E8521A] text-white rounded-xl hover:bg-[#c94415] disabled:opacity-40 transition-colors self-end py-3">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

function detectWebSearchIntent(message: string): boolean {
  const triggers = [
    "search for", "look up", "find information", "what is the current",
    "latest news", "price of", "weather in", "stock price", "how to",
    "what happened", "current price", "news about", "today's", "right now",
    "recent", "live", "real-time",
  ];
  const lower = message.toLowerCase();
  return triggers.some(t => lower.includes(t));
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  // Support both old format { messages } and new format { message, history }
  const messages = body.messages ?? [...(body.history ?? []), { role: "user", content: body.message }];
  const lastMessage = messages[messages.length - 1]?.content ?? "";
  const contextEnabled = body.contextEnabled !== false;
  const sessionSummary: string = body.sessionSummary ?? "";
  const contextNote: string = body.contextNote ?? "";

  // ── Web search (Tavily) ───────────────────────────────────────
  let webSearchBlock = "";
  let webSearchUsed = false;
  if (detectWebSearchIntent(lastMessage) && process.env.TAVILY_API_KEY) {
    try {
      const origin = req.nextUrl.origin;
      const searchRes = await fetch(`${origin}/api/web-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: lastMessage }),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.answer || searchData.results?.length) {
          webSearchUsed = true;
          webSearchBlock = `\n\nWEB SEARCH RESULTS (live data):\n${searchData.answer ?? ""}\n\nSOURCES:\n${
            (searchData.results ?? []).map((r: any) => `- ${r.title}: ${r.url}`).join("\n")
          }`;
        }
      }
    } catch (e) {
      console.error("Web search failed:", e);
    }
  }

  const [  
    { data: projects }, { data: updates }, { data: decisions },
    { data: rules }, { data: logs }, { data: recentSessions },
    { data: allTasks }
  ] = contextEnabled ? await Promise.all([
    supabase.from("projects").select("id, name, description, status, memory").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("content, next_actions, update_type, created_at, project_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("decisions").select("context, verdict, probability, outcome_rating, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("rules").select("rule_text, severity, active").eq("user_id", user.id).eq("active", true),
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, notes, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(7),
    supabase.from("ai_sessions").select("messages, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(3),
    supabase.from("project_tasks").select("id, title, status, priority, due_date, project_id").eq("user_id", user.id).neq("status", "cancelled").order("priority", { ascending: true }).limit(50),
  ]) : [
    { data: null }, { data: null }, { data: null },
    { data: null }, { data: null }, { data: null }, { data: null },
  ];

  // Fetch client context for owner
  const clientContextBlock = contextEnabled ? await (async () => {
    try {
      const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
      if (!ws) return "";
      const { data: clients } = await supabase.from("clients").select("id, name, status").eq("workspace_id", ws.id).eq("status", "active");
      if (!clients?.length) return "";
      const summaries = await Promise.all(clients.map(async (c: any) => {
        const { data: stages } = await supabase.from("client_stages").select("stage_name, status, department").eq("client_id", c.id);
        const done = stages?.filter((s: any) => s.status === "done").length ?? 0;
        const inProgress = stages?.filter((s: any) => s.status === "in_progress") ?? [];
        return `${c.name}: ${done}/${stages?.length ?? 14} stages done${inProgress.length > 0 ? ". In progress: " + inProgress.map((s: any) => s.stage_name).join(", ") : ""}`;
      }));
      return "\nACTIVE CLIENTS:\n" + summaries.join("\n");
    } catch { return ""; }
  })() : "";

  // Fetch connected integrations (GitHub repos, Supabase projects, etc.)
  // For GitHub integrations with an access token, also fetch repo tree/README for richer context
  const integrationsBlock = await (async () => {
    try {
      const { data } = await supabase
        .from("integrations")
        .select("type, name, config, status")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (!data?.length) return "";

      const lines: string[] = [];
      const repoContextLines: string[] = [];

      for (const i of data) {
        const meta: string[] = [];
        if (i.config?.org_or_user)   meta.push(`org/user: ${i.config.org_or_user}`);
        if (i.config?.repo_url)      meta.push(`repo: ${i.config.repo_url}`);
        if (i.config?.project_url)   meta.push(`project: ${i.config.project_url}`);
        if (i.config?.team_slug)     meta.push(`team: ${i.config.team_slug}`);
        if (i.config?.project_name)  meta.push(`project: ${i.config.project_name}`);
        if (i.config?.channel)       meta.push(`channel: ${i.config.channel}`);
        if (i.config?.team_name)     meta.push(`team: ${i.config.team_name}`);
        if (i.config?.database_id)   meta.push(`db: ${i.config.database_id}`);
        // note: tokens/keys are never included in AI context
        lines.push(`- ${i.type.toUpperCase()}: ${i.name}${meta.length ? ` (${meta.join(", ")})` : ""}`);

        // For GitHub: fetch repo tree + recent commits for structure context
        if (i.type === "github" && i.config?.access_token && !i.config.access_token.includes("****") && i.config?.org_or_user) {
          try {
            const repoName = i.config?.repo_url
              ? i.config.repo_url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")
              : null;
            if (repoName) {
              const headers: Record<string, string> = {
                Authorization: `token ${i.config.access_token}`,
                Accept: "application/vnd.github.v3+json",
              };
              // Fetch top-level tree and recent commits in parallel
              const [treeRes, commitsRes] = await Promise.all([
                fetch(`https://api.github.com/repos/${repoName}/git/trees/HEAD?recursive=0`, { headers }),
                fetch(`https://api.github.com/repos/${repoName}/commits?per_page=5`, { headers }),
              ]);
              const treeData = treeRes.ok ? await treeRes.json() : null;
              const commitsData = commitsRes.ok ? await commitsRes.json() : null;

              const topFiles = (treeData?.tree ?? [])
                .filter((f: any) => f.type === "blob" || f.type === "tree")
                .slice(0, 30)
                .map((f: any) => `${f.type === "tree" ? "📁" : "📄"} ${f.path}`)
                .join(", ");

              const recentCommits = Array.isArray(commitsData)
                ? commitsData.map((c: any) => `  - ${c.commit?.message?.split("\n")[0] ?? "?"} (${c.commit?.author?.date?.slice(0, 10) ?? "?"})`)
                    .join("\n")
                : "";

              if (topFiles || recentCommits) {
                repoContextLines.push(
                  `\nGITHUB REPO STRUCTURE (${repoName}):\nRoot: ${topFiles || "n/a"}` +
                  (recentCommits ? `\nRecent commits:\n${recentCommits}` : "")
                );
              }
            }
          } catch { /* skip if GitHub API fails */ }
        }
      }

      return "\nCONNECTED INTEGRATIONS:\n" + lines.join("\n") + repoContextLines.join("");
    } catch { return ""; }
  })();

  // Fetch department/team context for workspace owner
  const teamContextBlock = contextEnabled ? await (async () => {
    try {
      const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
      if (!ws) return "";
      const [{ data: depts }, { data: deptProjects }, { data: deptTasks }] = await Promise.all([
        supabase.from("departments").select("id, name, slug").eq("workspace_id", ws.id),
        supabase.from("dept_projects").select("name, status, dept_id").eq("workspace_id", ws.id).neq("status", "archived").order("updated_at", { ascending: false }).limit(20),
        supabase.from("dept_project_tasks").select("title, status, priority, dept_id").neq("status", "cancelled").order("created_at", { ascending: false }).limit(30),
      ]);
      if (!depts?.length) return "";
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });
      const lines: string[] = [];
      for (const dept of (depts ?? [])) {
        const dp = (deptProjects ?? []).filter((p: any) => p.dept_id === dept.id);
        const dt = (deptTasks ?? []).filter((t: any) => t.dept_id === dept.id);
        if (!dp.length && !dt.length) continue;
        lines.push(`[${dept.name.toUpperCase()} DEPT]`);
        if (dp.length) lines.push(`  Projects: ${dp.map((p: any) => `${p.name} (${p.status})`).join(", ")}`);
        const inProg = dt.filter((t: any) => t.status === "in_progress");
        const todo   = dt.filter((t: any) => t.status === "todo");
        if (inProg.length) lines.push(`  In progress: ${inProg.map((t: any) => t.title).join(", ")}`);
        if (todo.length)   lines.push(`  Todo (${todo.length}): ${todo.slice(0, 4).map((t: any) => t.title).join(", ")}${todo.length > 4 ? ` +${todo.length - 4} more` : ""}`);
      }
      return lines.length ? `DEPARTMENT STATUS:\n${lines.join("\n")}` : "";
    } catch { return ""; }
  })() : "";

  const projectMap: Record<string, string> = {};
  const projectMemory: Record<string, string> = {};
  (projects ?? []).forEach(p => {
    projectMap[(p as any).id] = (p as any).name;
    if ((p as any).memory) projectMemory[(p as any).name] = (p as any).memory;
  });

  // Build per-project task summary
  const tasksByProject: Record<string, { todo: string[]; in_progress: string[]; done: string[] }> = {};
  (allTasks ?? []).forEach((t: any) => {
    const pName = projectMap[t.project_id] ?? "Unknown";
    if (!tasksByProject[pName]) tasksByProject[pName] = { todo: [], in_progress: [], done: [] };
    const bucket = t.status === "done" || t.status === "completed" ? "done"
      : t.status === "in_progress" ? "in_progress" : "todo";
    // Include task_id in brackets so AI can reference it for complete_task action
    const label = `${t.title} [id:${t.id}]${t.due_date ? ` [due:${t.due_date.slice(0, 10)}]` : ""}`;
    tasksByProject[pName][bucket].push(label);
  });

  const tasksBlock = Object.entries(tasksByProject).map(([name, buckets]) => {
    const parts: string[] = [];
    if (buckets.in_progress.length) parts.push(`  🔄 In progress: ${buckets.in_progress.join(", ")}`);
    if (buckets.todo.length) parts.push(`  📋 Todo (${buckets.todo.length}): ${buckets.todo.slice(0, 5).join(", ")}${buckets.todo.length > 5 ? ` +${buckets.todo.length - 5} more` : ""}`);
    if (buckets.done.length) parts.push(`  ✅ Done recently: ${buckets.done.slice(0, 3).join(", ")}`);
    return `[${name}]\n${parts.join("\n") || "  (no tasks)"}`;
  }).join("\n");

  const sessionHistory = (recentSessions ?? [])
    .flatMap((s: any) => (s.messages ?? []).slice(-4))
    .slice(-12)
    .map((m: any) => `[${m.role}]: ${m.content}`)
    .join("\n");

  const contextBlock = `
ACTIVE PROJECTS: ${(projects ?? []).map(p => {
    const desc = (p as any).description ? ` — ${(p as any).description}` : "";
    return `${p.name}${desc} [id:${(p as any).id}]`;
  }).join(", ") || "none"}

PROJECT TASKS:
${tasksBlock || "(no tasks)"}

${Object.keys(projectMemory).length > 0 ? `PROJECT MEMORY:\n${Object.entries(projectMemory).map(([name, mem]) => `[${name}]: ${mem}`).join("\n")}\n` : ""}RECENT UPDATES:
${(updates ?? []).map(u => `- [${projectMap[u.project_id] ?? "unknown"}] ${u.update_type}: ${u.content}${u.next_actions ? ` → next: ${u.next_actions}` : ""}`).join("\n")}

DECISIONS:
${(decisions ?? []).map(d => `- ${d.verdict?.toUpperCase() ?? "?"} (${d.probability ?? "?"}%) [outcome: ${d.outcome_rating ?? "open"}]: ${d.context}`).join("\n")}

ACTIVE RULES:
${(rules ?? []).map(r => `- [severity ${r.severity}] ${r.rule_text}`).join("\n")}

BEHAVIOR (last 7 days):
${(logs ?? []).map(l => `- mood: ${l.mood_tag ?? "?"}, stress: ${l.stress ?? "?"}/10, sleep: ${l.sleep_hours ?? "?"}h`).join("\n")}

${sessionHistory ? `RECENT CONVERSATION HISTORY:\n${sessionHistory}` : ""}`.trim();

  const systemPrompt = contextEnabled
    ? `You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY: Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Surface intelligence, let the human decide.

Respond naturally in markdown. Never output JSON or structured data EXCEPT for action blocks (see below).

RESPONSE RULES:
- Factual questions: answer directly
- Patterns detected: "Observation: [what data shows]. [supporting data]. You decide."
- Never say "you should" — say "the data suggests" or "worth considering"
- Use markdown — bold key terms, bullets for lists
- Tight responses. No padding. No flattery.
- For live data (prices, news, events) — use web search

AUTO-DETECTION FROM CHAT (apply on every message):
1. PROJECTS: If user mentions a project name NOT in ACTIVE PROJECTS list → propose "app.create_project".
2. PROJECT UPDATES: If user describes progress, work done, or blockers on a project → proactively propose "app.add_project_update" to capture it. Don't wait to be asked — surface it naturally: "Want me to log this as a project update?"
3. TASKS: If user mentions a to-do, next step, or work item → propose "app.create_task" with the matching project_id (shown as [id:xxx] in ACTIVE PROJECTS). If multiple tasks, propose the highest priority one and list the rest.
4. TASK COMPLETION: If user says something is done/finished/deployed/merged → check PROJECT TASKS for a matching task and propose "app.complete_task" with its task_id.
5. GIT REPOS: When GITHUB REPO STRUCTURE is present, use the file tree and commit history to answer codebase questions accurately — reference real files, suggest tasks from recent commits, offer to create GitHub issues for bugs discussed.

ACTION SYSTEM (read carefully):
When the user asks to perform a write action — create a task, log a decision, update a project, create a GitHub issue, run SQL — you MUST:
1. Explain what you're about to do in plain markdown
2. End your response with a single [BUDDIES_ACTION] block:

[BUDDIES_ACTION]
{"type":"<action_type>","description":"<one sentence what this does>","warning":"<risk or null>","params":{...}}
[/BUDDIES_ACTION]

Supported action types and their params:
- "app.create_project": {"name":"...","description":"..."}
- "app.generate_document": {"title":"...","content":"full markdown document text"} ← use when user asks to write/create/draft a document, spec, proposal, report, plan, README, or any structured text. Write the FULL document in the content field.
- "app.create_task": {"title":"...","project_id":"...","priority":1-5,"due_date":"YYYY-MM-DD or null"}
- "app.complete_task": {"task_id":"...","title":"..."}
- "app.create_decision": {"context":"...","verdict":"proceed|pause|reject","probability":0-100}
- "app.update_project": {"project_id":"...","status":"active|completed|on_hold","description":"..."}
- "app.add_project_update": {"project_id":"...","content":"...","update_type":"progress|blocker|milestone","next_actions":"next step or null"}
- "github.create_issue": {"repo":"owner/repo","title":"...","body":"...","labels":["bug","enhancement",...]}
- "github.create_branch": {"repo":"owner/repo","branch":"feature/name","from":"main"}
- "supabase.run_sql": {"sql":"SELECT ...","description":"what this query does"}

RULES:
- Never include [BUDDIES_ACTION] for read-only questions or analysis
- Always include a "description" the user can read before approving
- Set "warning" to the risk, or null if safe
- Only ONE action block per response
- The user must approve before any action runs — you are PROPOSING, not executing
- For "app.complete_task": task_id comes from PROJECT TASKS list (id field)

CURRENT CONTEXT:
${contextBlock}${clientContextBlock ? `\n\nCLIENT STATUS:${clientContextBlock}` : ""}${teamContextBlock ? `\n\nTEAM CONTEXT:\n${teamContextBlock}` : ""}${integrationsBlock}${webSearchBlock}${sessionSummary ? `\n\nPREVIOUS CONVERSATION SUMMARY (earlier context from this chat — treat as memory):\n${sessionSummary}` : ""}${contextNote ? `\n\nUSER PINNED NOTE (always apply in every reply):\n${contextNote}` : ""}`
    : `You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY: Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Surface intelligence, let the human decide.

Respond naturally in markdown. Never output JSON or structured data EXCEPT for action blocks.

RESPONSE RULES:
- Factual questions: answer directly
- Patterns detected: "Observation: [what data shows]. [supporting data]. You decide."
- Never say "you should" — say "the data suggests" or "worth considering"
- Use markdown — bold key terms, bullets for lists
- Tight responses. No padding. No flattery.
- For live data (prices, news, events) — use web search

ACTION SYSTEM: Same rules as above — include [BUDDIES_ACTION] blocks for any write action requested.
${integrationsBlock}

Note: Context mode is OFF. Respond based on this conversation only.${webSearchBlock}${sessionSummary ? `\n\nPREVIOUS CONVERSATION SUMMARY:\n${sessionSummary}` : ""}${contextNote ? `\n\nUSER PINNED NOTE (always apply):\n${contextNote}` : ""}`;

  try {
    // ── PRIMARY: Claude ──────────────────────────────────────────
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 16000,
          system: systemPrompt,
          messages: messages.map((m: any) => {
            // Vision: message with attached image URLs
            if (m.images && m.images.length > 0) {
              return {
                role: m.role,
                content: [
                  { type: "text", text: m.content },
                  ...m.images.map((url: string) => ({
                    type: "image",
                    source: { type: "url", url },
                  })),
                ],
              };
            }
            return { role: m.role, content: m.content };
          }),
        });
        const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") || "No response.";
        return NextResponse.json({ response: text, text, provider: "claude", contextUsed: contextEnabled, webSearchUsed });
      } catch (claudeErr: any) {
        console.error("Claude error, falling back to OpenAI:", claudeErr.message);
      }
    }

    // ── FALLBACK: OpenAI ─────────────────────────────────────────
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Try Responses API with web search first
    try {
      const response = await (openai as any).responses.create({
        model: "gpt-4o-mini",
        tools: [{ type: "web_search_preview" }],
        input: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
      });

      const text = response.output
        ?.filter((o: any) => o.type === "message")
        ?.flatMap((o: any) => o.content ?? [])
        ?.filter((c: any) => c.type === "output_text")
        ?.map((c: any) => c.text)
        ?.join("") ?? "";

      return NextResponse.json({ response: text, text, provider: "openai", contextUsed: contextEnabled, webSearchUsed });
    } catch {
      // Fallback to chat completions
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 16000,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      });
      const text = response.choices[0]?.message?.content ?? "No response.";
      return NextResponse.json({ response: text, text, provider: "openai-fallback", contextUsed: contextEnabled, webSearchUsed });
    }
  } catch (err: any) {
    return NextResponse.json({ text: `Error: ${err.message}` });
  }
}

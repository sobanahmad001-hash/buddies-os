import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify user owns this project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: messages } = await supabase
    .from("project_chat_messages")
    .select("id, role, content, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(100);

  return NextResponse.json({ messages: messages ?? [] });
}

export async function POST(req: NextRequest) {
  try {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { projectId, message, mode } = await req.json();
  if (!projectId || !message) return NextResponse.json({ error: "projectId and message required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Load all project context + integrations in parallel
  const [
    { data: tasks },
    { data: updates },
    { data: projectDecisions },
    { data: projectRules },
    { data: projectResearch },
    { data: chatHistory },
    { data: integrations },
  ] = await Promise.all([
    supabase.from("project_tasks").select("title, status, priority, due_date").eq("project_id", projectId).neq("status", "cancelled"),
    supabase.from("project_updates").select("content, update_type, next_actions, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20),
    supabase.from("project_decisions").select("title, context, verdict, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20),
    supabase.from("project_rules").select("rule_text, severity, active").eq("project_id", projectId).eq("active", true),
    supabase.from("project_research").select("topic, notes, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(10),
    supabase.from("project_chat_messages").select("role, content").eq("project_id", projectId).order("created_at", { ascending: true }).limit(40),
    supabase.from("integrations").select("type, name, config, status").eq("user_id", user.id).eq("status", "active"),
  ]);

  // Build project context block
  const taskLines = (tasks ?? []).map((t: any) => `- [${t.status}] ${t.title}${t.priority === 1 ? " (urgent)" : ""}${t.due_date ? ` due ${t.due_date}` : ""}`).join("\n");
  const updateLines = (updates ?? []).slice(0, 10).map((u: any) => `[${u.update_type}] ${u.content}`).join("\n");
  const decisionLines = (projectDecisions ?? []).map((d: any) => `- ${d.title}: ${d.verdict ?? "pending"}`).join("\n");
  const ruleLines = (projectRules ?? []).map((r: any) => `- [S${r.severity}] ${r.rule_text}`).join("\n");
  const researchLines = (projectResearch ?? []).map((r: any) => `[${r.topic}] ${r.notes.slice(0, 300)}`).join("\n");

  // Build integrations context block (GitHub live data + Supabase info)
  let integrationsBlock = "";
  for (const i of (integrations ?? [])) {
    if (i.type === "github" && i.config?.access_token && !i.config.access_token.includes("****") && i.config?.org_or_user) {
      try {
        const repoName = i.config?.repo_url
          ? i.config.repo_url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "")
          : null;
        if (repoName) {
          const ghHeaders: Record<string, string> = {
            Authorization: `token ${i.config.access_token}`,
            Accept: "application/vnd.github.v3+json",
          };
          const [treeRes, commitsRes, issuesRes, prsRes] = await Promise.all([
            fetch(`https://api.github.com/repos/${repoName}/git/trees/HEAD?recursive=0`, { headers: ghHeaders }),
            fetch(`https://api.github.com/repos/${repoName}/commits?per_page=10`, { headers: ghHeaders }),
            fetch(`https://api.github.com/repos/${repoName}/issues?state=open&per_page=10`, { headers: ghHeaders }),
            fetch(`https://api.github.com/repos/${repoName}/pulls?state=open&per_page=5`, { headers: ghHeaders }),
          ]);
          const [treeData, commitsData, issuesData, prsData] = await Promise.all([
            treeRes.ok ? treeRes.json() : null,
            commitsRes.ok ? commitsRes.json() : null,
            issuesRes.ok ? issuesRes.json() : null,
            prsRes.ok ? prsRes.json() : null,
          ]);

          const topFiles = (treeData?.tree ?? [])
            .filter((f: any) => f.type === "blob" || f.type === "tree")
            .slice(0, 40)
            .map((f: any) => `${f.type === "tree" ? "📁" : "📄"} ${f.path}`)
            .join("\n");

          const recentCommits = Array.isArray(commitsData)
            ? commitsData.map((c: any) => `  - ${c.commit?.message?.split("\n")[0] ?? "?"} (${c.commit?.author?.date?.slice(0, 10) ?? "?"} by ${c.commit?.author?.name ?? "?"})`)
                .join("\n")
            : "";

          const openIssues = Array.isArray(issuesData)
            ? issuesData.filter((i: any) => !i.pull_request).map((i: any) => `  #${i.number}: ${i.title} [${i.state}]`).join("\n")
            : "";

          const openPRs = Array.isArray(prsData)
            ? prsData.map((p: any) => `  #${p.number}: ${p.title} (${p.head?.ref} → ${p.base?.ref})`).join("\n")
            : "";

          integrationsBlock += `\n\nGITHUB REPO: ${repoName}\n`;
          if (topFiles) integrationsBlock += `FILE STRUCTURE:\n${topFiles}\n`;
          if (recentCommits) integrationsBlock += `\nRECENT COMMITS:\n${recentCommits}\n`;
          if (openIssues) integrationsBlock += `\nOPEN ISSUES:\n${openIssues}\n`;
          if (openPRs) integrationsBlock += `\nOPEN PULL REQUESTS:\n${openPRs}\n`;
        }
      } catch { /* skip if GitHub API fails */ }
    } else if (i.type === "supabase" && i.config?.project_url) {
      integrationsBlock += `\n\nSUPABASE PROJECT: ${i.config.project_url}\n`;
      integrationsBlock += `Connected Supabase project for data storage and auth.\n`;
    }
  }

  const systemPrompt = `You are the dedicated AI assistant for the project "${project.name}".
${project.description ? `Project description: ${project.description}` : ""}
${project.memory ? `Project memory: ${project.memory}` : ""}

You have full access to this project's data including its connected GitHub repository and Supabase database.
You can read code files, review commits, check open issues/PRs, and help the user work on this project.
You have full read and write capability for this project's tasks, decisions, rules, and research.

${taskLines ? `TASKS:\n${taskLines}` : "No tasks yet."}
${updateLines ? `\nRECENT UPDATES:\n${updateLines}` : ""}
${decisionLines ? `\nDECISIONS:\n${decisionLines}` : ""}
${ruleLines ? `\nACTIVE RULES (follow these strictly):\n${ruleLines}` : ""}
${researchLines ? `\nRESEARCH NOTES:\n${researchLines}` : ""}
${integrationsBlock}

When the user asks you to create tasks, log decisions, add rules, or write research notes, acknowledge clearly that you've done so.
When the user asks about code, refer to the GitHub repo structure and commits above.
${mode === "document" ? "\nYou are in DOCUMENT GENERATION mode. Return only the document content in clean markdown." : ""}`;

  // Build conversation history for context
  const historyMessages = (chatHistory ?? []).map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Save user message
  await supabase.from("project_chat_messages").insert({
    project_id: projectId,
    user_id: user.id,
    role: "user",
    content: message,
  });

  // Call AI (Claude with OpenAI fallback)
  let reply = "";
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          ...historyMessages,
          { role: "user", content: message },
        ],
      });
      reply = response.content[0].type === "text" ? response.content[0].text : "";
    }
    if (!reply) throw new Error("No Claude response");
  } catch (claudeErr: any) {
    console.error("Claude error, falling back to OpenAI:", claudeErr.message);
    try {
      const oaiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: message },
        ],
      });
      reply = oaiRes.choices[0].message.content ?? "";
    } catch (oaiErr: any) {
      console.error("OpenAI error:", oaiErr.message);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  // Save assistant reply
  await supabase.from("project_chat_messages").insert({
    project_id: projectId,
    user_id: user.id,
    role: "assistant",
    content: reply,
  });

  // Auto-detect decisions from assistant reply and log them
  if (mode !== "document" && reply.toLowerCase().includes("decision:")) {
    const lines = reply.split("\n").filter(l => l.toLowerCase().startsWith("decision:"));
    for (const line of lines) {
      const title = line.replace(/^decision:\s*/i, "").split(".")[0].trim().slice(0, 120);
      if (title) {
        await supabase.from("project_decisions").insert({
          project_id: projectId,
          user_id: user.id,
          title,
          context: message,
          verdict: title,
        });
      }
    }
  }

  return NextResponse.json({ reply });
  } catch (err: any) {
    console.error("[project-chat] unhandled error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}

// Delete all chat history for a project
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("project_chat_messages").delete().eq("project_id", projectId);
  return NextResponse.json({ success: true });
}

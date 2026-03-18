import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildProjectMemory } from "@/lib/ai/project-memory";
import { callAIProvider } from "@/lib/ai/providers";
import { createActionFingerprint } from "@/lib/ai/action-fingerprint";

const ACTION_OPEN = "[BUDDIES_ACTION]";
const ACTION_CLOSE = "[/BUDDIES_ACTION]";

type ProviderKey = "anthropic" | "openai" | "xai";

function isMissingSessionSchemaError(err: any): boolean {
  const code = String(err?.code ?? "");
  const message = String(err?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("project_chat_sessions") ||
    message.includes("session_id")
  );
}

function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
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

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseActionBlockPayload(raw: string): Record<string, any> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const candidate = extractFirstJsonObject(trimmed);
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
}

function extractFirstActionFromReply(content: string): Record<string, any> | null {
  const start = content.indexOf(ACTION_OPEN);
  if (start === -1) return null;

  const afterOpen = content.slice(start + ACTION_OPEN.length);
  const closeIdx = afterOpen.indexOf(ACTION_CLOSE);
  const rawPayload = closeIdx === -1 ? afterOpen : afterOpen.slice(0, closeIdx);
  return parseActionBlockPayload(rawPayload);
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

function normalizeSingleActionBlock(reply: string): string {
  const firstAction = extractFirstActionFromReply(reply);
  const cleanText = stripAllActionBlocks(reply).trim();
  if (!firstAction?.type || !firstAction?.params) return cleanText;

  const canonical = `${ACTION_OPEN}\n${JSON.stringify(firstAction, null, 2)}\n${ACTION_CLOSE}`;
  return cleanText ? `${cleanText}\n\n${canonical}` : canonical;
}

function isExplicitDocumentSaveRequest(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\bcreate\s+document\b/.test(text) ||
    /\bsave\b/.test(text) ||
    /\bstore\b/.test(text) ||
    /\bpersist\b/.test(text) ||
    /\blog\b/.test(text) ||
    /\badd\s+(it\s+)?to\s+(the\s+)?project\b/.test(text) ||
    /\bnew\s+document\b/.test(text)
  );
}

function isContentOnlyDraftRequest(message: string): boolean {
  const text = message.toLowerCase();
  const asksForContent = /(\bwrite\b|\bdraft\b|\bcompose\b|\bgenerate\b|\brewrite\b|\bpolish\b|\bimprove\b|\boutline\b|\bhomepage\b|\bcopy\b)/.test(text);
  return asksForContent && !isExplicitDocumentSaveRequest(message);
}

function parseActionIntent(message: string, projectId: string) {
  const lower = message.toLowerCase().trim();

  const taskMatch =
    lower.startsWith("create task") ||
    lower.startsWith("add task") ||
    lower.startsWith("make task");

  if (taskMatch) {
    const title = message.replace(/^(create|add|make)\s+task\s*/i, "").trim();
    if (title) {
      return {
        type: "project.create_task",
        description: `Create a task in this project`,
        warning: "This will write a new task to the project.",
        params: {
          project_id: projectId,
          title,
          priority: 3,
        },
      };
    }
  }

  const ruleMatch =
    lower.startsWith("add rule") ||
    lower.startsWith("create rule") ||
    lower.startsWith("add constraint") ||
    lower.startsWith("create constraint");

  if (ruleMatch) {
    const ruleText = message.replace(/^(add|create)\s+(rule|constraint)\s*/i, "").trim();
    if (ruleText) {
      return {
        type: "project.create_rule",
        description: `Add a project constraint`,
        warning: "This will add an active rule/constraint to the project.",
        params: {
          project_id: projectId,
          rule_text: ruleText,
          severity: 2,
        },
      };
    }
  }

  const researchMatch =
    lower.startsWith("add research") ||
    lower.startsWith("save research") ||
    lower.startsWith("log research");

  if (researchMatch) {
    const notes = message.replace(/^(add|save|log)\s+research\s*/i, "").trim();
    if (notes) {
      return {
        type: "project.create_research",
        description: `Save a research note in this project`,
        warning: "This will write a research note to the project.",
        params: {
          project_id: projectId,
          topic: "Research Note",
          notes,
        },
      };
    }
  }

  return null;
}

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
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify user owns this project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sessionId) {
    const { data: session } = await supabase
      .from("project_chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let query = supabase
    .from("project_chat_messages")
    .select("id, role, content, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { data: messages } = await query;

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

    const {
      projectId,
      sessionId,
      message,
      mode,
      provider,
      model,
      images,
    } = await req.json();

    const imageUrls = Array.isArray(images)
      ? images.filter((url: unknown) => typeof url === "string" && url.trim())
      : [];

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    if (!message && imageUrls.length === 0) {
      return NextResponse.json({ error: "message or images required" }, { status: 400 });
    }

    const effectiveMessage = message || "Please analyze the attached image(s).";

    const { data: project } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let activeSessionId = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
    let useSessions = true;

    try {
      if (activeSessionId) {
        const { data: existingSession, error: existingSessionError } = await supabase
          .from("project_chat_sessions")
          .select("id")
          .eq("id", activeSessionId)
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .single();

        if (existingSessionError) throw existingSessionError;
        if (!existingSession) {
          return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }
      } else {
        const titleSeed = effectiveMessage.slice(0, 60) || "New chat";
        const { data: createdSession, error: createSessionError } = await supabase
          .from("project_chat_sessions")
          .insert({
            project_id: projectId,
            user_id: user.id,
            title: titleSeed,
          })
          .select("id")
          .single();

        if (createSessionError) throw createSessionError;

        activeSessionId = createdSession?.id ?? null;
        if (!activeSessionId) {
          return NextResponse.json({ error: "Failed to create chat session" }, { status: 500 });
        }
      }
    } catch (sessionErr: any) {
      if (isMissingSessionSchemaError(sessionErr)) {
        useSessions = false;
        activeSessionId = null;
        console.warn("[project-chat] session schema not available; using legacy project chat mode");
      } else {
        throw sessionErr;
      }
    }

    const quickIntent = parseActionIntent(effectiveMessage, projectId);

    if (quickIntent) {
      const fingerprint = createActionFingerprint(quickIntent.type, quickIntent.params);

      const recentAssistantQuery = useSessions && activeSessionId
        ? supabase
          .from("project_chat_messages")
          .select("content, created_at")
          .eq("project_id", projectId)
          .eq("session_id", activeSessionId)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(8)
        : supabase
          .from("project_chat_messages")
          .select("content, created_at")
          .eq("project_id", projectId)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(8);

      const { data: recentAssistant } = await recentAssistantQuery;

      const alreadyProposed = (recentAssistant ?? []).some((m: any) => {
        const content = String(m.content ?? "");
        return content.includes("[BUDDIES_ACTION]") && content.includes(fingerprint);
      });

      if (alreadyProposed) {
        const dedupeReply = "That exact action was already proposed recently in this thread. Approve the existing action card or change the request.";
        await supabase.from("project_chat_messages").insert({
          project_id: projectId,
          ...(useSessions ? { session_id: activeSessionId } : {}),
          user_id: user.id,
          role: "user",
          content: effectiveMessage,
        });
        await supabase.from("project_chat_messages").insert({
          project_id: projectId,
          ...(useSessions ? { session_id: activeSessionId } : {}),
          user_id: user.id,
          role: "assistant",
          content: dedupeReply,
        });
        if (useSessions && activeSessionId) {
          await supabase
            .from("project_chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", activeSessionId)
            .eq("user_id", user.id);
        }
        return NextResponse.json({ reply: dedupeReply, sessionId: activeSessionId });
      }
    }

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
      // Load chat history: session-specific if available, otherwise recent project messages.
      // Session mode: load up to 50 messages from the same session (preserves full context)
      // Legacy mode: load only last 20 messages from entire project (prevents old cross-session noise)
      (useSessions && activeSessionId
        ? supabase.from("project_chat_messages").select("role, content").eq("project_id", projectId).eq("session_id", activeSessionId).order("created_at", { ascending: true }).limit(50)
        : supabase.from("project_chat_messages").select("role, content").eq("project_id", projectId).order("created_at", { ascending: true }).limit(20)),
      supabase.from("integrations").select("type, name, config, status").eq("user_id", user.id).eq("status", "active"),
    ]);

    const taskLines = (tasks ?? []).map((t: any) => `- [${t.status}] ${t.title}${t.priority === 1 ? " (urgent)" : ""}${t.due_date ? ` due ${t.due_date}` : ""}`).join("\n");
    const updateLines = (updates ?? []).slice(0, 10).map((u: any) => `[${u.update_type}] ${u.content}`).join("\n");
    const decisionLines = (projectDecisions ?? []).map((d: any) => `- ${d.title}: ${d.verdict ?? "pending"}`).join("\n");
    const ruleLines = (projectRules ?? []).map((r: any) => `- [S${r.severity}] ${r.rule_text}`).join("\n");
    const researchLines = (projectResearch ?? []).map((r: any) => `[${r.topic}] ${r.notes.slice(0, 300)}`).join("\n");

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
              ? commitsData.map((c: any) => `  - ${c.commit?.message?.split("\n")[0] ?? "?"} (${c.commit?.author?.date?.slice(0, 10) ?? "?"} by ${c.commit?.author?.name ?? "?"})`).join("\n")
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
        } catch {}
      } else if (i.type === "supabase" && i.config?.project_url) {
        integrationsBlock += `\n\nSUPABASE PROJECT: ${i.config.project_url}\nConnected Supabase project for data storage and auth.\n`;
      }
    }

    const systemPrompt = `You are the dedicated AI assistant for the project "${project.name}".
${project.description ? `Project description: ${project.description}` : ""}
${project.memory ? `Project memory: ${project.memory}` : ""}

You have full read access to this project's data including its connected GitHub repository and Supabase database.
You can analyze code files, review commits, check open issues/PRs, and help the user work on this project.

BUDDIES OPERATING APPROACH:
1. Context — first understand what the user is trying to achieve in this project, what constraints matter, what already exists, and what success looks like.
2. Solution — once enough context exists, propose the best path clearly and align on it when needed.
3. Execution — for meaningful write actions, do NOT claim the action already happened. Propose the action clearly, and include a single [BUDDIES_ACTION] JSON block so the UI can ask for approval first.

PROJECT RULES FOR BEHAVIOR:
- Do not jump into execution when project context is still unclear.
- Do not ask unnecessary questions when the project state already provides enough context.
- Ask only the minimum sharp questions needed to remove ambiguity.
- When the user is clearly ready, move from context to solution quickly.
- For writes to project data (tasks, decisions, rules, research, updates, saved documents), require approval first through a [BUDDIES_ACTION] block.
- If the user asks only for generated content (for example: "write", "draft", "generate copy") and does not explicitly ask to save/create a project document, return plain content with NO action block.
- Read-only analysis, summaries, and recommendations do not need action blocks.
- Never say "done" unless the write has actually been executed by the app after approval.

ACTION BLOCK FORMAT:
[BUDDIES_ACTION]
{
  "type": "project.create_task" | "project.create_decision" | "project.create_rule" | "project.create_research" | "project.create_document" | "project.add_update",
  "description": "short human explanation",
  "warning": "optional warning or null",
  "params": { ... }
}
[/BUDDIES_ACTION]

When proposing project actions, always include project_id: "${projectId}" in params.

${taskLines ? `TASKS:\n${taskLines}` : "No tasks yet."}
${updateLines ? `\nRECENT UPDATES:\n${updateLines}` : ""}
${decisionLines ? `\nDECISIONS:\n${decisionLines}` : ""}
${ruleLines ? `\nACTIVE RULES (follow these strictly):\n${ruleLines}` : ""}
${researchLines ? `\nRESEARCH NOTES:\n${researchLines}` : ""}
${integrationsBlock}
${mode === "document" ? "\nYou are in DOCUMENT GENERATION mode. Return only the document content in clean markdown." : ""}`;

    const historyMessages = (chatHistory ?? []).map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    await supabase.from("project_chat_messages").insert({
      project_id: projectId,
      ...(useSessions ? { session_id: activeSessionId } : {}),
      user_id: user.id,
      role: "user",
      content: effectiveMessage,
    });

    let reply = "";

    try {
      const rawProvider: unknown = provider;
      const selectedProvider: ProviderKey =
        rawProvider === "openai" || rawProvider === "xai" || rawProvider === "anthropic"
          ? rawProvider
          : "anthropic";

      const providerAllowedModels: Record<ProviderKey, string[]> = {
        anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5"],
        openai: ["gpt-4o-mini", "gpt-4o"],
        xai: ["grok-3-mini", "grok-3"],
      };

      const providerDefaultModel: Record<ProviderKey, string> = {
        anthropic: "claude-haiku-4-5-20251001",
        openai: "gpt-4o-mini",
        xai: "grok-3-mini",
      };

      const providerEnvKey: Record<ProviderKey, string | undefined> = {
        anthropic: process.env.ANTHROPIC_API_KEY,
        openai: process.env.OPENAI_API_KEY,
        xai: process.env.XAI_API_KEY,
      };

      const normalizedModel = typeof model === "string" ? model.trim() : "";

      const preferredOrder: ProviderKey[] = [
        selectedProvider,
        ...(["anthropic", "openai", "xai"] as ProviderKey[]).filter((p) => p !== selectedProvider),
      ];
      const configuredOrder = preferredOrder.filter((p) => Boolean(providerEnvKey[p]));

      if (configuredOrder.length === 0) {
        return NextResponse.json(
          { error: "No AI provider is configured. Add at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY, or XAI_API_KEY." },
          { status: 500 }
        );
      }

      // Build message content with images if present
      let userMessageContent: string | Array<{ type: string; text?: string; source?: { type: string; url?: string } }>;
      
      if (images && images.length > 0) {
        userMessageContent = [
          { type: 'text', text: effectiveMessage },
          ...imageUrls.map((url: string) => ({
            type: 'image',
            source: { type: 'url', url },
          })),
        ];
      } else {
        userMessageContent = effectiveMessage;
      }

      let providerError: any = null;

      for (const providerAttempt of configuredOrder) {
        const selectedModel = providerAllowedModels[providerAttempt].includes(normalizedModel)
          ? normalizedModel
          : providerDefaultModel[providerAttempt];

        try {
          const result = await callAIProvider({
            provider: providerAttempt,
            model: selectedModel,
            system: systemPrompt,
            messages: [
              ...historyMessages,
              { role: "user", content: userMessageContent },
            ],
          });

          reply = result.text?.trim() || "";
          if (reply) {
            // Diagnostic: log raw output before any transformation so we can
            // tell whether short responses come from the model or post-processing.
            console.log(
              `[project-chat] RAW provider=${providerAttempt} model=${selectedModel} chars=${reply.length}`
            );
            if (reply.length < 600) {
              console.log("[project-chat] RAW_TEXT_START\n" + reply + "\n[project-chat] RAW_TEXT_END");
            }
            providerError = null;
            break;
          }

          providerError = new Error(`Empty response from ${providerAttempt}`);
        } catch (err: any) {
          providerError = err;
          console.error(`[project-chat] provider attempt failed (${providerAttempt}):`, err?.message ?? err);
        }
      }

      if (!reply) {
        throw providerError || new Error("No provider response");
      }
    } catch (err: any) {
      console.error("[project-chat] provider error:", err?.message ?? err);
      const message = err?.message ? String(err.message) : "AI unavailable";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    reply = normalizeSingleActionBlock(reply);

    if (isContentOnlyDraftRequest(effectiveMessage)) {
      // Hard guard: content-only drafting requests must never surface action blocks.
      // Recovery priority:
      //   1. params.content from a create_document action, IF it is substantially
      //      longer than the plain text (handles "Done. I've created…" + action block)
      //   2. Plain text if it is the real draft content
      //   3. Fallback prompt asking for more detail
      const firstAction = extractFirstActionFromReply(reply);
      const plain = stripAllActionBlocks(reply).trim();
      const embeddedContent =
        firstAction?.type === "project.create_document" &&
        typeof firstAction?.params?.content === "string"
          ? firstAction.params.content.trim()
          : "";

      if (embeddedContent && embeddedContent.length > plain.length + 50) {
        // Model wrapped the full draft inside the action block — recover it.
        reply = embeddedContent;
      } else if (plain) {
        reply = plain;
      } else {
        reply = "I can write that now. Please share any preferred tone, audience, and structure, or say 'use default' and I will generate the full draft.";
      }
    }

    if (quickIntent && !extractFirstActionFromReply(reply)) {
      reply = `${reply.trim()}\n\n[BUDDIES_ACTION]\n${JSON.stringify(quickIntent, null, 2)}\n[/BUDDIES_ACTION]`;
    }

    await supabase.from("project_chat_messages").insert({
      project_id: projectId,
      ...(useSessions ? { session_id: activeSessionId } : {}),
      user_id: user.id,
      role: "assistant",
      content: reply,
    });

    if (useSessions && activeSessionId) {
      await supabase
        .from("project_chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeSessionId)
        .eq("user_id", user.id);
    }

    try {
      const { data: refreshTasks } = await supabase
        .from("project_tasks")
        .select("title, status, priority, due_date")
        .eq("project_id", projectId);

      const { data: refreshUpdates } = await supabase
        .from("project_updates")
        .select("content, update_type, next_actions, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: refreshDecisions } = await supabase
        .from("project_decisions")
        .select("title, context, verdict, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: refreshRules } = await supabase
        .from("project_rules")
        .select("rule_text, severity, active")
        .eq("project_id", projectId)
        .eq("active", true);

      const { data: refreshResearch } = await supabase
        .from("project_research")
        .select("topic, notes, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10);

      const compact = buildProjectMemory({
        project,
        tasks: refreshTasks ?? [],
        updates: refreshUpdates ?? [],
        decisions: refreshDecisions ?? [],
        rules: refreshRules ?? [],
        research: refreshResearch ?? [],
      });

      await supabase.from("ai_project_memory").upsert({
        user_id: user.id,
        project_id: projectId,
        project_name: compact.project_name ?? null,
        purpose: compact.purpose ?? null,
        current_stage: compact.current_stage ?? null,
        active_priorities: compact.active_priorities ?? [],
        open_blockers: compact.open_blockers ?? [],
        key_decisions: compact.key_decisions ?? [],
        constraints: compact.constraints ?? [],
        next_actions: compact.next_actions ?? [],
        summary_text: compact.summary_text ?? null,
        summary_json: compact.summary_json ?? {},
        updated_at: new Date().toISOString(),
      });
    } catch (memoryErr: any) {
      console.error("[project-chat] project memory refresh failed:", memoryErr?.message ?? memoryErr);
    }

    // Defensive: ensure reply is always non-empty before returning
    if (!reply || reply.trim() === "") {
      reply = "I'm ready to help. What would you like me to do with this project?";
    }

    return NextResponse.json({ reply, sessionId: activeSessionId, provider: provider ?? "anthropic", model: model ?? null });
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
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sessionId) {
    const { data: session } = await supabase
      .from("project_chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    await supabase.from("project_chat_messages").delete().eq("project_id", projectId).eq("session_id", sessionId);
    await supabase.from("project_chat_sessions").delete().eq("id", sessionId).eq("project_id", projectId).eq("user_id", user.id);
    return NextResponse.json({ success: true });
  }

  await supabase.from("project_chat_messages").delete().eq("project_id", projectId);
  await supabase.from("project_chat_sessions").delete().eq("project_id", projectId).eq("user_id", user.id);
  return NextResponse.json({ success: true });
}

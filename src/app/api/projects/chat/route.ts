import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildProjectMemory } from "@/lib/ai/project-memory";
import { callAIProvider } from "@/lib/ai/providers";
import { createActionFingerprint } from "@/lib/ai/action-fingerprint";
import { buildCompressedContext } from "@/lib/ai/session-compress";
import { writeMemorySignals } from "@/lib/ai/memory-extract";
import { checkRateLimit } from "@/lib/rate-limit";

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

function normalizeAllActionBlocks(reply: string): string {
  const actions: Record<string, any>[] = [];
  let tempReply = reply;
  let safeCount = 0;
  while (tempReply.includes(ACTION_OPEN) && safeCount < 10) {
    const action = extractFirstActionFromReply(tempReply);
    if (!action?.type || !action?.params) break;
    actions.push(action);
    // Strip the first occurrence
    const start = tempReply.indexOf(ACTION_OPEN);
    const afterOpen = tempReply.slice(start + ACTION_OPEN.length);
    const closeIdx = afterOpen.indexOf(ACTION_CLOSE);
    if (closeIdx === -1) { tempReply = tempReply.slice(0, start); break; }
    tempReply = tempReply.slice(0, start) + tempReply.slice(start + ACTION_OPEN.length + closeIdx + ACTION_CLOSE.length);
    safeCount++;
  }
  const cleanText = tempReply.trim();
  if (actions.length === 0) return cleanText;
  const blocks = actions.map(a => `${ACTION_OPEN}\n${JSON.stringify(a, null, 2)}\n${ACTION_CLOSE}`);
  return [cleanText, ...blocks].filter(Boolean).join("\n\n");
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

/**
 * Detect short messages that implicitly reference the current session history.
 * When true, the system prompt gets a CRITICAL override instructing the model
 * to resolve the reference from context rather than resetting to a generic prompt.
 */
function isReferentialFollowUp(message: string): boolean {
  const text = message.toLowerCase().trim();
  // Long messages are never pure referential shorthand
  if (text.length > 140) return false;

  const patterns: RegExp[] = [
    // "find in this chat" / "find in this thread" / "find in chat" etc.
    /\b(find|look|check|search)\s+(it\s+)?(in|from)\s+(this\s+)?(chat|thread|conversation|history|context|session|above|earlier)/,
    // "use this chat" / "use above" / "use earlier context" / "use what we discussed"
    /^use\s+(this\s+)?(chat|thread|context|history|conversation|above|earlier|what\s+we|the\s+previous|the\s+last|the\s+same|default)/,
    // "infer from this chat" / "infer it from context"
    /\b(infer|derive|figure\s+out|work\s+out)\s+(it\s+)?(from\s+)?(this\s+)?(chat|thread|context|history|conversation|above|earlier)/,
    // "same tone" / "same structure" / "same as above" / "keep the same"
    /^(same|keep|maintain|stick\s+with|use\s+the\s+same)\s+(the\s+)?(tone|style|structure|audience|format|approach|voice|persona|template)/,
    // "continue" / "proceed" / "go ahead" / "yes proceed"
    /^(continue|proceed|go\s+ahead|do\s+it|just\s+do\s+it|yes[,.]?\s*proceed|yes[,.]?\s*go\s+ahead|just\s+draft\s+it|just\s+write\s+it)/,
    // "from this chat" / "from earlier" / "from above"
    /^from\s+(this\s+)?(chat|thread|context|history|conversation|session|earlier|above)/,
    // "based on this chat" / "based on what we discussed"
    /^based\s+on\s+(this\s+)?(chat|thread|context|history|what\s+we|the\s+above)/,
    // "as discussed" / "as we discussed" / "as mentioned"
    /^as\s+(we\s+)?(discussed|mentioned|agreed|decided|said|noted|talked\s+about)/,
    // "use the above" / "above context" / "previous context"
    /^(use\s+)?(the\s+)?(above|previous)\s+(context|tone|structure|audience|info|content|details|discussion)/,
    // plain "use default" when there is a prior question in context
    /^use\s+default\b/,
  ];
  return patterns.some((p) => p.test(text));
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

    // Rate limiting: 40 project chat requests per minute per user
    const rateLimit = checkRateLimit(`project-chat:${user.id}`, { maxRequests: 40, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetInMs / 1000)} seconds.`,
        retryAfterMs: rateLimit.resetInMs,
      }, { status: 429 });
    }

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

    // Mark previous exchange as implicitly confirmed (user continued the conversation)
    if (activeSessionId) {
      (async () => {
        await supabase.from("training_logs")
          .update({ was_confirmed: true })
          .eq("context_snapshot->>'session_id'", activeSessionId)
          .eq("was_confirmed", false)
          .order("created_at", { ascending: false })
          .limit(1);
      })().catch(() => {});
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
      { data: projectMemoryRow },
      { data: rankedMemoryItems },
      { data: projectDocs },
      { data: projectFiles },
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
      // ── NEW: read persisted project memory (written after each response) ──
      supabase.from("ai_project_memory").select("*").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
      // ── NEW: read top ranked memory items for this project ──
      supabase.from("ai_memory_items").select("memory_type, title, content, importance, keywords").eq("project_id", projectId).eq("user_id", user.id).eq("status", "active").order("importance", { ascending: false }).limit(8),
      // ── Document retrieval ──
      supabase.from("project_documents")
        .select("id, title, content, doc_type, is_living, created_at")
        .eq("project_id", projectId)
        .order("is_living", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8),
      // ── Uploaded files context ──
      supabase.from("project_files")
        .select("filename, file_type, summary, extracted_text, created_at")
        .eq("project_id", projectId)
        .not("summary", "is", null)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    // ── Document context ──────────────────────────────────────────────────────────
    const livingDoc = (projectDocs ?? []).find((d: any) => d.is_living);
    const otherDocs = (projectDocs ?? []).filter((d: any) => !d.is_living).slice(0, 4);

    const docsBlock = [
      livingDoc ? `LIVING PRODUCT DOCUMENT (always current):\nTitle: ${livingDoc.title}\n${livingDoc.content.slice(0, 1200)}${livingDoc.content.length > 1200 ? "\n[...truncated]" : ""}` : "",
      otherDocs.length > 0 ? `PROJECT DOCUMENTS:\n${otherDocs.map((d: any) => `- [${d.doc_type}] ${d.title} (${new Date(d.created_at).toLocaleDateString()})\n  ${d.content.slice(0, 300)}${d.content.length > 300 ? "\u2026" : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    const taskLines = (tasks ?? []).map((t: any) => `- [${t.status}] ${t.title}${t.priority === 1 ? " (urgent)" : ""}${t.due_date ? ` due ${t.due_date}` : ""}`).join("\n");

    const filesBlock = (projectFiles ?? []).length > 0
      ? `\nUPLOADED FILES (available as project context):\n${(projectFiles ?? []).map((f: any) =>
        `- ${f.filename} (${f.file_type}): ${f.summary ?? ""}${f.extracted_text ? `\n  Content: ${f.extracted_text.slice(0, 400)}…` : ""}`
      ).join("\n")}`
      : "";
    const updateLines = (updates ?? []).slice(0, 10).map((u: any) => `[${u.update_type}] ${u.content}`).join("\n");
    const decisionLines = (projectDecisions ?? []).map((d: any) => `- ${d.title}: ${d.verdict ?? "pending"}`).join("\n");
    const ruleLines = (projectRules ?? []).map((r: any) => `- [S${r.severity}] ${r.rule_text}`).join("\n");
    const researchLines = (projectResearch ?? []).map((r: any) => `[${r.topic}] ${r.notes.slice(0, 300)}`).join("\n");

    let integrationsBlock = "";
    
    // Wrap GitHub integration fetching in a race condition to prevent timeout.
    // Vercel Hobby has a 10s limit; GitHub API can be slow. If the block takes
    // longer than 5s total, we skip it and return the prompt without GitHub data.
    const integrationsBlockPromise = (async () => {
      let block = "";
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

              // ── Timeout wrapper ──────────────────────────────────────────────
              // Vercel Hobby = 10s hard limit. GitHub fetches have no timeout
              // by default and can hang indefinitely on degraded API/network.
              // Each fetch gets 4s. The whole block gets 5s via Promise.race.
              const ghFetch = (url: string) =>
                fetch(url, {
                  headers: ghHeaders,
                  signal: AbortSignal.timeout(4000),
                }).catch(() => null);

              const githubBlockPromise = (async () => {
                let ghBlock = "";
                const [treeRes, commitsRes, issuesRes, prsRes] = await Promise.all([
                  ghFetch(`https://api.github.com/repos/${repoName}/git/trees/HEAD?recursive=0`),
                  ghFetch(`https://api.github.com/repos/${repoName}/commits?per_page=10`),
                  ghFetch(`https://api.github.com/repos/${repoName}/issues?state=open&per_page=10`),
                  ghFetch(`https://api.github.com/repos/${repoName}/pulls?state=open&per_page=5`),
                ]);

                const [treeData, commitsData, issuesData, prsData] = await Promise.all([
                  treeRes?.ok ? treeRes.json() : null,
                  commitsRes?.ok ? commitsRes.json() : null,
                  issuesRes?.ok ? issuesRes.json() : null,
                  prsRes?.ok ? prsRes.json() : null,
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

                ghBlock += `\n\nGITHUB REPO: ${repoName}\n`;
                if (topFiles) ghBlock += `FILE STRUCTURE:\n${topFiles}\n`;
                if (recentCommits) ghBlock += `\nRECENT COMMITS:\n${recentCommits}\n`;
                if (openIssues) ghBlock += `\nOPEN ISSUES:\n${openIssues}\n`;
                if (openPRs) ghBlock += `\nOPEN PULL REQUESTS:\n${openPRs}\n`;
                return ghBlock;
              })();

              // 5s hard cap on the entire GitHub block
              const blockTimeout = new Promise<string>((resolve) =>
                setTimeout(() => resolve(""), 5000)
              );

              block += await Promise.race([githubBlockPromise, blockTimeout]);
            }
          } catch {
            // GitHub unavailable — skip silently, don't block the response
          }
        } else if (i.type === "supabase" && i.config?.project_url) {
          block += `\n\nSUPABASE PROJECT: ${i.config.project_url}\nConnected Supabase project for data storage and auth.\n`;
        }
      }
      return block;
    })();

    // Race the GitHub block against a 5s timeout. If GitHub is slow, return empty string.
    const timeoutPromise = new Promise<string>((resolve) => 
      setTimeout(() => resolve(""), 5000)
    );

    integrationsBlock = await Promise.race([integrationsBlockPromise, timeoutPromise]);

    // ── Sliding window compression ────────────────────────────────────────────────
    const rawHistory = (chatHistory ?? []).map((m: any) => ({
      role: m.role as string,
      content: m.content,
    }));
    const { summary: sessionSummaryCompressed, recentMessages: historyMessages, wasCompressed } =
      await buildCompressedContext(rawHistory, activeSessionId, supabase);
    const compressionNote = sessionSummaryCompressed
      ? `\nSESSION HISTORY SUMMARY (earlier turns compressed):\n${sessionSummaryCompressed}\n`
      : "";

    // ── Build persisted memory block ─────────────────────────────────────────────
    const pm = projectMemoryRow;
    const persistedMemoryBlock = pm ? `
PROJECT MEMORY (persisted from previous sessions):
- Purpose: ${pm.purpose ?? "n/a"}
- Current stage: ${pm.current_stage ?? "n/a"}
- Summary: ${pm.summary_text ?? "n/a"}
- Active priorities: ${Array.isArray(pm.active_priorities) ? pm.active_priorities.join(" | ") : "n/a"}
- Open blockers: ${Array.isArray(pm.open_blockers) ? pm.open_blockers.join(" | ") : "none"}
- Key decisions: ${Array.isArray(pm.key_decisions) ? pm.key_decisions.map((d: any) => `${d.title ?? d} (${d.verdict ?? "pending"})`).join(" | ") : "none"}
- Constraints: ${Array.isArray(pm.constraints) ? pm.constraints.map((c: any) => c.rule_text ?? c).join(" | ") : "none"}
- Next actions: ${Array.isArray(pm.next_actions) ? pm.next_actions.join(" | ") : "none"}` : "";

    const rankedMemoryBlock = (rankedMemoryItems ?? []).length > 0 ? `
RANKED MEMORY ITEMS (from past work on this project):
${(rankedMemoryItems ?? []).map((m: any) => `- [${m.memory_type}] ${m.title ? `${m.title}: ` : ""}${m.content}`).join("\n")}` : "";

    const referentialNote = isReferentialFollowUp(effectiveMessage)
      ? `
CRITICAL — SHORT REFERENTIAL FOLLOW-UP DETECTED:
The user's current message is a short follow-up that refers to earlier turns in this session.
The RECENT CONVERSATION above contains the relevant context.
You MUST:
- Resolve any missing details (tone, audience, structure, etc.) from the recent session turns above.
- Proceed with the task using that inferred context. Do NOT ask again for information already established.
- Do NOT reset to a generic greeting or ask "what would you like me to do?".
- If the prior assistant turn asked a clarifying question, treat this follow-up as answering or deferring that question to context.
Failure to honour this rule and proceeding with a generic question or greeting is incorrect behaviour.`
      : "";

    const systemPrompt = `You are the dedicated AI assistant for the project "${project.name}".
${project.description ? `Project description: ${project.description}` : ""}
${project.memory ? `Project memory: ${project.memory}` : ""}

You have full read access to this project's data including its connected GitHub repository and Supabase database.
You can analyze code files, review commits, check open issues/PRs, and help the user work on this project.

BUDDIES OPERATING APPROACH:
1. Context — first understand what the user is trying to achieve in this project, what constraints matter, what already exists, and what success looks like.
2. Solution — once enough context exists, propose the best path clearly and align on it when needed.
3. Execution — for meaningful write actions, do NOT claim the action already happened. Propose the action clearly, and include a single [BUDDIES_ACTION] JSON block so the UI can ask for approval first.

HANDLING SHORT FOLLOW-UPS AND REFERENTIAL MESSAGES:
- When the user sends a short follow-up that references the current session (e.g. "find in this chat", "use what we discussed", "same tone", "continue", "proceed", "use default"), resolve it using the RECENT CONVERSATION turns in this prompt. Do NOT ask again for details already established in the thread.
- If the prior assistant turn asked a question with options, and the user's reply is short or deferring ("find in this chat", "use default", "from above"), infer the answer from context and proceed.
- The phrase "What would you like me to do with this project?" is only acceptable as the very first message of a brand-new session with zero prior context. In any ongoing thread, it is ALWAYS wrong to reset to that phrase.

PROJECT RULES FOR BEHAVIOR:
- Do not jump into execution when project context is still unclear.
- Do not ask unnecessary questions when the project state already provides enough context.
- Ask only the minimum sharp questions needed to remove ambiguity.
- When the user is clearly ready, move from context to solution quickly.
- For writes to project data (tasks, decisions, rules, research, updates, saved documents), require approval first through a [BUDDIES_ACTION] block.
- When creating MULTIPLE tasks, include ALL [BUDDIES_ACTION] blocks in a single response — one block per task. Do NOT send them one at a time. The UI handles multiple blocks correctly.
- If the user asks only for generated content (for example: "write", "draft", "generate copy") and does not explicitly ask to save/create a project document, return plain content with NO action block.
- Read-only analysis, summaries, and recommendations do not need action blocks.
- Never say "done" unless the write has actually been executed by the app after approval.
- CRITICAL: ALWAYS write at least one sentence of explanation before any [BUDDIES_ACTION] block. Never open a response with a bare action block — the user needs context first. Explain what you are proposing and why, then place the action block(s) at the end of your response.

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

${persistedMemoryBlock}
${compressionNote}
${rankedMemoryBlock}${docsBlock ? `\n${docsBlock}` : ""}
${filesBlock}
${taskLines ? `\nTASKS:\n${taskLines}` : "No tasks yet."}
${updateLines ? `\nRECENT UPDATES:\n${updateLines}` : ""}
${decisionLines ? `\nDECISIONS:\n${decisionLines}` : ""}
${ruleLines ? `\nACTIVE RULES (follow these strictly):\n${ruleLines}` : ""}
${researchLines ? `\nRESEARCH NOTES:\n${researchLines}` : ""}
${integrationsBlock}
${mode === "document" ? "\nYou are in DOCUMENT GENERATION mode. Return only the document content in clean markdown." : ""}
${referentialNote}`;

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
          : "openai";  // Default to OpenAI

      const providerAllowedModels: Record<ProviderKey, string[]> = {
        anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-5"],
        openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano"],
        xai: ["grok-3-mini", "grok-3"],
      };

      const providerDefaultModel: Record<ProviderKey, string> = {
        anthropic: "claude-haiku-4-5-20251001",
        openai: "gpt-4.1",          // GPT-4.1: 1M context, best instruction following
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
      const isQuotaError = (err: any): boolean => {
        const msg = String(err?.message ?? err ?? '').toLowerCase();
        return (
          msg.includes('usage limits') ||
          msg.includes('quota') ||
          msg.includes('you have reached') ||
          msg.includes('insufficient_quota') ||
          msg.includes('billing') ||
          (err?.status === 429 && msg.includes('limit'))
        );
      };

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
          const isQuota = isQuotaError(err);
          console.error(`[project-chat] provider attempt failed (${providerAttempt}):`, err?.message ?? err);
          if (isQuota) {
            console.warn(`[project-chat] ${providerAttempt} quota exhausted; trying next provider`);
          }
        }
      }

      if (!reply) {
        // Check if all providers failed due to quota
        const isAllQuotaErrors = isQuotaError(providerError);
        if (isAllQuotaErrors) {
          throw new Error(`All configured AI providers have reached their usage limits. Please try again after updating API quotas or on ${new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toLocaleDateString()}.`);
        }
        throw providerError || new Error("No provider response");
      }
    } catch (err: any) {
      console.error("[project-chat] provider error:", err?.message ?? err);
      const message = err?.message ? String(err.message) : "AI unavailable";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    reply = normalizeAllActionBlocks(reply);

    // Guard: if reply starts directly with an action block (no explanation text before it),
    // prepend a minimal intro so the chat bubble is never blank above the action card.
    {
      const plainBefore = stripAllActionBlocks(reply).trim();
      if (!plainBefore && reply.includes(ACTION_OPEN)) {
        const firstAction = extractFirstActionFromReply(reply);
        const desc = firstAction?.description ?? "Proposed action";
        reply = `Here's what I'd like to do — ${desc}:\n\n${reply.trimStart()}`;
      }
    }

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

    // ── Training log: every exchange captured ─────────────────────────────────
    (async () => {
      await supabase.from("training_logs").insert({
        user_id: user.id,
        raw_input: effectiveMessage,
        parsed_output: { reply },
        was_confirmed: false,
        final_output: { reply },
        was_edited: false,
        source: "claude",
        model_version: model ?? "claude-haiku-4-5-20251001",
        intent_detected: isContentOnlyDraftRequest(effectiveMessage) ? "draft" :
                         isReferentialFollowUp(effectiveMessage) ? "referential" : "chat",
        confidence_score: null,
        context_snapshot: {
          project_id: projectId,
          session_id: activeSessionId,
          had_project_memory: Boolean(projectMemoryRow),
          had_ranked_memory: (rankedMemoryItems ?? []).length > 0,
          referential: isReferentialFollowUp(effectiveMessage),
          compressed: wasCompressed,
        },
      });
    })().catch(() => {}); // fire and forget

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

      // ── Extract and write memory signals ────────────────────────────────────────
      writeMemorySignals({
        userId: user.id,
        projectId,
        sessionId: activeSessionId,
        userMessage: effectiveMessage,
        aiResponse: reply,
        supabase,
      }).catch(() => {});
    } catch (memoryErr: any) {
      console.error("[project-chat] project memory refresh failed:", memoryErr?.message ?? memoryErr);
    }

    // Defensive: ensure reply is always non-empty before returning.
    // Never return the generic reset phrase for sessions that have history.
    if (!reply || reply.trim() === "") {
      const hasHistory = historyMessages.length > 0;
      reply = hasHistory
        ? "I didn't quite catch that — could you clarify what you'd like me to do next?"
        : "I'm ready to help. What would you like me to work on for this project?";
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

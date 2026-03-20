import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callAIProvider, getDefaultModelForProvider, normalizeProvider, type AIProvider } from '@/lib/ai/providers';
import { buildCompressedContext } from '@/lib/ai/session-compress';

const MODEL_COSTS = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'grok-3-mini': { input: 0, output: 0 },
  'grok-3': { input: 0, output: 0 },
} as const;

type MessageType = 'chat' | 'analysis' | 'decision';
const SUMMARY_FIRST_CONTEXT_ENABLED = process.env.MAIN_AI_SUMMARY_FIRST !== 'false';

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs =
    MODEL_COSTS[model as keyof typeof MODEL_COSTS] || { input: 0, output: 0 };

  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

function detectMessageType(message: string): MessageType {
  const analysisKeywords = [
    'analyze',
    'analysis',
    'pattern',
    'insight',
    'correlation',
    'trend',
    'why',
    'show me',
    'what does',
    'compare',
    'evaluate',
    'review',
  ];

  const decisionKeywords = [
    'decide',
    'decision',
    'should i',
    'choose',
    'better',
    'recommend',
    'which',
    'help me decide',
    'best option',
    'tradeoff',
  ];

  const lower = message.toLowerCase();

  if (decisionKeywords.some((k) => lower.includes(k))) return 'decision';
  if (analysisKeywords.some((k) => lower.includes(k))) return 'analysis';

  return 'chat';
}

function normalizeHistory(history: any[]) {
  return history
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
}

function detectProjectFocus(
  message: string,
  projects: any[]
) {
  const haystack = ` ${message.toLowerCase()} `;

  return (
    projects.find(
      (p) => {
        if (!p?.name) return false;
        const projectName = String(p.name).toLowerCase().trim();
        return projectName.length > 0 && haystack.includes(` ${projectName} `);
      }
    ) || null
  );
}

function compressContext(
  raw: any,
  messageType: MessageType,
  recentConversation: Array<{ role: string; content: string }>,
  sessionSummary: string,
  contextNote: string,
  focusedProject: any | null,
  summaryFirstMode: boolean
) {
  const activeProjects =
    raw.projects?.filter((p: any) => p.status === 'active') || [];

  const relevantProjectId = focusedProject?.id ?? null;

  const relevantUpdates = (raw.updates || [])
    .filter((u: any) => !relevantProjectId || u.project_id === relevantProjectId)
    .slice(0, 8);

  const relevantTasks = (raw.tasks || [])
    .filter((t: any) => {
      if (relevantProjectId && t.project_id !== relevantProjectId) return false;
      return t.status === 'in_progress' || (t.priority && t.priority >= 4);
    })
    .slice(0, 15);

  const relevantDecisions = (raw.decisions || [])
    .filter((d: any) => !relevantProjectId || d.project_id === relevantProjectId)
    .slice(0, messageType === 'decision' ? 8 : 5);

  const activeRules = (raw.rules || [])
    .filter((r: any) => (r.severity || 0) >= 3)
    .slice(0, 8);

  const openBlockers = (raw.blockers || [])
    .filter((b: any) => {
      if (relevantProjectId && b.project_id !== relevantProjectId) return false;
      return ['open', 'in_progress', 'blocked'].includes((b.status || '').toLowerCase());
    })
    .slice(0, 8);

  const summaryOverview = {
    active_project_count: activeProjects.length,
    open_blocker_count: openBlockers.length,
    in_progress_task_count: (raw.tasks || []).filter((t: any) => t.status === 'in_progress').length,
    high_priority_task_count: (raw.tasks || []).filter((t: any) => t.priority && t.priority >= 4).length,
    recent_update_count: (raw.updates || []).length,
    recent_decision_count: (raw.decisions || []).length,
    project_health_snapshot: activeProjects.slice(0, 8).map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      health: p.health || 'unknown',
      current_focus: p.current_focus || null,
    })),
  };

  const projectDirectory = activeProjects.slice(0, 20).map((p: any) => ({
    id: p.id,
    name: p.name,
    status: p.status,
  }));

  const base = {
    focused_project: focusedProject
      ? {
          id: focusedProject.id,
          name: focusedProject.name,
          status: focusedProject.status,
          health: focusedProject.health,
          current_focus: focusedProject.current_focus,
          next_milestone: focusedProject.next_milestone,
        }
      : null,
    session_summary: sessionSummary || '',
    context_note: contextNote || '',
    active_projects: focusedProject ? activeProjects.slice(0, 10) : [],
    current_tasks:
      summaryFirstMode && !focusedProject
        ? []
        : relevantTasks,
    recent_updates:
      summaryFirstMode && !focusedProject
        ? []
        : relevantUpdates.map((u: any) => ({
            ...u,
            project_name: u.projects?.name || u.project_name || 'unknown',
          })),
    recent_decisions:
      summaryFirstMode && !focusedProject
        ? []
        : relevantDecisions,
    open_blockers:
      summaryFirstMode && !focusedProject
        ? []
        : openBlockers,
    active_rules:
      summaryFirstMode && !focusedProject
        ? []
        : activeRules,
    overview: summaryOverview,
    project_directory: projectDirectory,
    mood_trend: (raw.behavior || []).slice(0, 3),
    conversation: recentConversation,
    integrations: (raw.integrations || []).slice(0, 10),
  };

  if (messageType === 'analysis' || messageType === 'decision') {
    return {
      ...base,
      all_project_candidates: activeProjects.slice(0, 20),
      behavior_week: (raw.behavior || []).slice(0, 7),
    };
  }

  return base;
}

function buildSystemPrompt(context: any): string {
  const sections: string[] = [];

  if (context.focused_project) {
    sections.push(
      `FOCUSED PROJECT:
- ${context.focused_project.name}
- status: ${context.focused_project.status || 'unknown'}
- health: ${context.focused_project.health || 'unknown'}
- current_focus: ${context.focused_project.current_focus || 'n/a'}
- next_milestone: ${context.focused_project.next_milestone || 'n/a'}`
    );
  }

  if (context.overview) {
    sections.push(
      `CROSS-PROJECT OVERVIEW:
- active_projects: ${context.overview.active_project_count}
- open_blockers: ${context.overview.open_blocker_count}
- in_progress_tasks: ${context.overview.in_progress_task_count}
- high_priority_tasks: ${context.overview.high_priority_task_count}
- recent_updates: ${context.overview.recent_update_count}
- recent_decisions: ${context.overview.recent_decision_count}`
    );
  }

  if (context.project_directory?.length) {
    sections.push(
      `PROJECT DIRECTORY (use this to disambiguate target project when needed):
${context.project_directory.map((p: any) => `- ${p.name} [${p.status || 'unknown'}]`).join('\n')}`
    );
  }

  if (context.session_summary) {
    sections.push(`SESSION SUMMARY:\n${context.session_summary}`);
  }

  if (context.context_note) {
    sections.push(`USER CONTEXT NOTE:\n${context.context_note}`);
  }

  if (context.current_tasks?.length) {
    sections.push(
      `CURRENT TASKS:\n${context.current_tasks
        .map(
          (t: any) =>
            `- [${t.status}] ${t.title} (priority: ${t.priority || 3})`
        )
        .join('\n')}`
    );
  }

  if (context.recent_updates?.length) {
    sections.push(
      `RECENT UPDATES:\n${context.recent_updates
        .map(
          (u: any) =>
            `- [${u.project_name}] ${u.update_type || 'update'}: ${u.content || u.summary || ''}`
        )
        .join('\n')}`
    );
  }

  if (context.recent_decisions?.length) {
    sections.push(
      `RECENT DECISIONS:\n${context.recent_decisions
        .map(
          (d: any) =>
            `- ${d.context || d.title || 'decision'} (${d.status || 'unknown'})`
        )
        .join('\n')}`
    );
  }

  if (context.open_blockers?.length) {
    sections.push(
      `OPEN BLOCKERS:\n${context.open_blockers
        .map(
          (b: any) =>
            `- ${b.title || b.description || 'blocker'} [${b.status || 'open'}] severity: ${b.severity || 'unknown'}`
        )
        .join('\n')}`
    );
  }

  if (context.active_rules?.length) {
    sections.push(
      `ACTIVE RULES:\n${context.active_rules
        .map(
          (r: any) =>
            `- [severity ${r.severity || 0}] ${r.content || r.title || 'rule'}`
        )
        .join('\n')}`
    );
  }

  if (context.conversation?.length) {
    sections.push(
      `RECENT CONVERSATION:\n${context.conversation
        .map((m: any) => `- ${m.role}: ${m.content}`)
        .join('\n')}`
    );
  }

  return `You are Buddies OS, a personal AI advisor for entrepreneurial and operational work.

Your job is to preserve continuity, reason from active project context, and give answers that feel aware of recent work, blockers, decisions, and priorities.

BUDDIES OPERATING APPROACH:
1. Context — first understand what the user is actually trying to do, what constraints matter, what already exists, and what "done" means.
2. Solution — once enough context exists, propose the best path clearly and align on the solution when needed.
3. Execution — execute directly if possible after permission for meaningful or irreversible actions. If direct execution is not possible, give the best concrete execution path instead of vague advice.

OPERATING RULES:
- Do not jump into execution if the request is still ambiguous.
- Do not ask unnecessary questions if enough context already exists.
- Ask only the sharpest missing questions when context is insufficient.
- When the user is clearly ready to proceed, move from context to solution or execution without friction.
- For high-impact actions, confirm the intended solution before execution.
- Prefer concrete, operational answers over generic advice.
- Do not answer like a fresh chatbot unless context is truly missing.
- When context is partial, say what you know and continue from it.
- For project write actions from Main AI (e.g., add task/update), if no project is explicitly mentioned, ask a single short follow-up question to select the target project.
- Only use deep project context when the user explicitly names a project.

${sections.join('\n\n')}`;
}


export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const message =
      body.message ||
      body.messages?.[body.messages.length - 1]?.content ||
      '';
    const images = Array.isArray(body.images)
      ? body.images.filter((url: unknown) => typeof url === 'string' && url.trim())
      : [];

    const sessionId = body.sessionId ?? null;
    const history = Array.isArray(body.history) ? body.history : [];
    const sessionSummary = body.sessionSummary || '';
    const contextNote = body.contextNote || '';
    const contextEnabled = body.contextEnabled !== false;

    if (!message && images.length === 0) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const effectiveMessage = message || 'Please analyze the attached image(s).';

    const provider: AIProvider = normalizeProvider(body.provider);
    const requestedModel = body.model;

    const messageType = detectMessageType(effectiveMessage);
    const model = requestedModel || getDefaultModelForProvider(provider, messageType);

    const { summary: sessionSummaryCompressed, recentMessages: recentConversation } =
      await buildCompressedContext(history, sessionId, supabase);
    const compressionNote = sessionSummaryCompressed
      ? `\nSESSION HISTORY SUMMARY (earlier turns compressed):\n${sessionSummaryCompressed}\n`
      : "";

    // Base queries — always run (lightweight)
    const baseQueries = [
      supabase.from('projects').select('id, name, status, updated_at').eq('user_id', user.id),
      supabase.from('behavior_logs').select('sleep_hours, stress, confidence, mood_tag, cognitive_score, timestamp').eq('user_id', user.id).order('timestamp', { ascending: false }).limit(7),
    ];

    const [{ data: allProjects }, { data: behavior }] = await Promise.all(baseQueries);

    const focusedProject = contextEnabled
      ? detectProjectFocus(effectiveMessage, allProjects ?? [])
      : null;

    // Deep queries — only run when a project is explicitly mentioned
    let tasks: any[] = [];
    let updates: any[] = [];
    let decisions: any[] = [];
    let rules: any[] = [];
    let projectMemory: any = null;

    if (focusedProject && contextEnabled) {
      const [tRes, uRes, dRes, rRes, pmRes] = await Promise.all([
        supabase.from('project_tasks').select('title, status, priority, due_date, project_id').eq('project_id', focusedProject.id).neq('status', 'cancelled').limit(20),
        supabase.from('project_updates').select('content, update_type, created_at').eq('project_id', focusedProject.id).order('created_at', { ascending: false }).limit(8),
        supabase.from('decisions').select('context, verdict, created_at').eq('user_id', user.id).eq('project_id', focusedProject.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('rules').select('rule_text, severity').eq('user_id', user.id).eq('active', true).limit(5),
        supabase.from('ai_project_memory').select('purpose, current_stage, summary_text, active_priorities, open_blockers, next_actions').eq('project_id', focusedProject.id).eq('user_id', user.id).maybeSingle(),
      ]);
      tasks = tRes.data ?? [];
      updates = uRes.data ?? [];
      decisions = dRes.data ?? [];
      rules = rRes.data ?? [];
      projectMemory = pmRes.data ?? null;
    }

    // Build project directory (name + status only, all projects)
    const projectDirectory = (allProjects ?? [])
      .filter((p: any) => p.status === 'active')
      .map((p: any) => ({ id: p.id, name: p.name, status: p.status }));

    const systemPrompt = `You are Buddies OS — a personal AI assistant. You are like Claude but with persistent memory of your projects and work.

OPERATING MODE: Lightweight chat. You know the user's projects exist. Only go deep on a project when they explicitly mention it by name.

RULES:
- Answer conversationally. Don't dump project data unless asked.
- If user mentions a project by name, use the deep context below.
- You can add tasks to projects: ask "which project?" if unclear.
- Never pretend context exists when it doesn't.
- Prefer short, direct answers. Ask one sharp question if unclear.
${compressionNote}
PROJECTS (${projectDirectory.length} active):
${projectDirectory.map((p: any) => `- ${p.name}`).join('\n') || 'None yet.'}

RECENT BEHAVIOR SIGNALS:
${(behavior ?? []).slice(0, 3).map((b: any) => `- ${new Date(b.timestamp).toLocaleDateString()}: mood=${b.mood_tag ?? '?'}, stress=${b.stress ?? '?'}, cognitive=${b.cognitive_score ?? '?'}`).join('\n') || 'No recent logs.'}

${focusedProject ? `
FOCUSED PROJECT: ${focusedProject.name}
${projectMemory ? `Summary: ${projectMemory.summary_text ?? 'n/a'}
Stage: ${projectMemory.current_stage ?? 'n/a'}
Priorities: ${Array.isArray(projectMemory.active_priorities) ? projectMemory.active_priorities.join(', ') : 'n/a'}
Blockers: ${Array.isArray(projectMemory.open_blockers) ? projectMemory.open_blockers.join(', ') : 'none'}
Next: ${Array.isArray(projectMemory.next_actions) ? projectMemory.next_actions.join(', ') : 'n/a'}` : ''}

TASKS:
${tasks.map((t: any) => `- [${t.status}] ${t.title}`).join('\n') || 'None.'}

RECENT UPDATES:
${updates.map((u: any) => `- ${u.update_type}: ${u.content}`).join('\n') || 'None.'}

RECENT DECISIONS:
${decisions.map((d: any) => `- ${d.context} → ${d.verdict ?? 'pending'}`).join('\n') || 'None.'}
` : ''}

${recentConversation.length > 0 ? `RECENT CONVERSATION:\n${recentConversation.map((m: any) => `${m.role}: ${m.content}`).join('\n')}` : ''}`;

    // Build message content with images if present
    let userMessageContent: string | Array<{ type: string; text?: string; source?: { type: string; url?: string } }>;
    
    if (images && images.length > 0) {
      userMessageContent = [
        { type: 'text', text: effectiveMessage },
        ...images.map((url: string) => ({
          type: 'image',
          source: { type: 'url', url },
        })),
      ];
    } else {
      userMessageContent = effectiveMessage;
    }

    const aiResult = await callAIProvider({
      provider,
      model,
      system: systemPrompt,
      messages: [
        ...(recentConversation as Array<{ role: 'user' | 'assistant'; content: string }>),
        { role: 'user', content: userMessageContent },
      ],
      maxTokens: 4096,
    });

    const text = aiResult.text;
    const inputTokens = aiResult.inputTokens || 0;
    const outputTokens = aiResult.outputTokens || 0;
    const cost = calculateCost(aiResult.model, inputTokens, outputTokens);

    try {
      await supabase.from('ai_usage').insert({
        user_id: user.id,
        model: aiResult.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
        message_type: messageType,
        session_id: sessionId,
      });
    } catch (usageError) {
      console.error('AI usage logging error:', usageError);
    }

    return NextResponse.json({
      response: text,
      contextUsed: {
        focusedProject: focusedProject?.name || null,
        usedSessionSummary: Boolean(sessionSummary),
        usedContextNote: Boolean(contextNote),
        historyCount: recentConversation.length,
        messageType,
      },
      webSearchUsed: false,
      model: aiResult.model,
      provider: aiResult.provider,
    });
  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Record when user edits AI output (training signal) ─────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { original, edited, context } = await request.json();
    if (!original || !edited) return NextResponse.json({ error: 'original and edited required' }, { status: 400 });

    await supabase.from('training_logs').insert({
      user_id: user.id,
      raw_input: original,
      parsed_output: { original },
      was_confirmed: true,
      final_output: { edited },
      was_edited: true,
      source: 'claude',
      model_version: context?.model ?? 'unknown',
      intent_detected: context?.intent ?? 'edit',
      confidence_score: null,
      correction_delta: {
        original_length: original.length,
        edited_length: edited.length,
        context: context ?? {},
      },
    });

    return NextResponse.json({ logged: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


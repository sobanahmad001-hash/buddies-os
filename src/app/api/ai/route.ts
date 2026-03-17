import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callAIProvider, getDefaultModelForProvider, normalizeProvider, type AIProvider } from '@/lib/ai/providers';

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
  sessionSummary: string,
  contextNote: string,
  projects: any[]
) {
  const haystack = `${contextNote}\n${sessionSummary}\n${message}`.toLowerCase();

  return (
    projects.find(
      (p) => p?.name && haystack.includes(String(p.name).toLowerCase())
    ) || null
  );
}

function compressContext(
  raw: any,
  messageType: MessageType,
  recentConversation: Array<{ role: string; content: string }>,
  sessionSummary: string,
  contextNote: string,
  focusedProject: any | null
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
    active_projects: activeProjects.slice(0, 10),
    current_tasks: relevantTasks,
    recent_updates: relevantUpdates.map((u: any) => ({
      ...u,
      project_name: u.projects?.name || u.project_name || 'unknown',
    })),
    recent_decisions: relevantDecisions,
    open_blockers: openBlockers,
    active_rules: activeRules,
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

    const sessionId = body.sessionId ?? null;
    const history = Array.isArray(body.history) ? body.history : [];
    const sessionSummary = body.sessionSummary || '';
    const contextNote = body.contextNote || '';
    const contextEnabled = body.contextEnabled !== false;

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const provider: AIProvider = normalizeProvider(body.provider);
    const requestedModel = body.model;

    const messageType = detectMessageType(message);
    const model = requestedModel || getDefaultModelForProvider(provider, messageType);

    const recentConversation = normalizeHistory(history);

    const queryList = [
      supabase.from('projects').select('*').eq('user_id', user.id),
      supabase
        .from('project_tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('project_updates')
        .select('*, projects(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('decisions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('rules').select('*').eq('user_id', user.id),
      supabase
        .from('behavior_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(7),
      supabase.from('integrations').select('*').eq('user_id', user.id),
    ];

    let blockersEnabled = false;
    try {
      queryList.push(
        supabase
          .from('blockers')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)
      );
      blockersEnabled = true;
    } catch {
      blockersEnabled = false;
    }

    const results = await Promise.all(queryList);

    const projects = results[0];
    const tasks = results[1];
    const updates = results[2];
    const decisions = results[3];
    const rules = results[4];
    const behavior = results[5];
    const integrations = results[6];
    const blockers = blockersEnabled ? results[7] : { data: [] };

    const rawContext = {
      projects: projects.data || [],
      tasks: tasks.data || [],
      updates: updates.data || [],
      decisions: decisions.data || [],
      rules: rules.data || [],
      behavior: behavior.data || [],
      integrations: integrations.data || [],
      blockers: blockers.data || [],
    };

    const focusedProject = contextEnabled
      ? detectProjectFocus(
          message,
          sessionSummary,
          contextNote,
          rawContext.projects
        )
      : null;

    const context = contextEnabled
      ? compressContext(
          rawContext,
          messageType,
          recentConversation,
          sessionSummary,
          contextNote,
          focusedProject
        )
      : {
          focused_project: null,
          session_summary: sessionSummary || '',
          context_note: contextNote || '',
          conversation: recentConversation,
        };

    const systemPrompt = buildSystemPrompt(context);

    const aiResult = await callAIProvider({
      provider,
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
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
        focusedProject: context.focused_project?.name || null,
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


export type MessageType = 'chat' | 'analysis' | 'decision';

export interface SessionMemory {
  active_project: string | null;
  current_focus: string | null;
  open_blockers: string[];
  decisions_made: string[];
  next_steps: string[];
  user_preferences: string[];
  key_topics: string[];
  summary: string | null;
}

export function detectMessageType(message: string): MessageType {
  const lower = message.toLowerCase();

  const analysisKeywords = [
    'analyze', 'analysis', 'pattern', 'insight', 'correlation',
    'trend', 'why', 'root cause', 'investigate', 'diagnose'
  ];

  const decisionKeywords = [
    'decide', 'should i', 'choose', 'better', 'recommend',
    'which', 'tradeoff', 'option', 'pros and cons'
  ];

  if (decisionKeywords.some((k) => lower.includes(k))) return 'decision';
  if (analysisKeywords.some((k) => lower.includes(k))) return 'analysis';
  return 'chat';
}

export function detectProjectFocus(
  message: string,
  projects: Array<{ name?: string | null }>,
  existing?: string | null
): string | null {
  const lower = message.toLowerCase();

  for (const p of projects) {
    const name = (p.name || '').trim();
    if (!name) continue;
    if (lower.includes(name.toLowerCase())) return name;
  }

  return existing || null;
}

export function uniq(items: string[]): string[] {
  return [...new Set(items.map((x) => x.trim()).filter(Boolean))];
}

export function compressContext(
  context: any,
  messageType: MessageType,
  sessionMemory?: SessionMemory | null
) {
  const recentConversation =
    messageType === 'chat'
      ? context.history?.slice(-8) || []
      : context.history?.slice(-12) || [];

  return {
    active_projects: context.projects?.filter((p: any) => p.status === 'active') || [],
    current_tasks:
      context.tasks
        ?.filter((t: any) => t.status === 'in_progress' || (t.priority && t.priority >= 4))
        ?.slice(0, messageType === 'chat' ? 12 : 18) || [],
    recent_updates: context.updates?.slice(0, messageType === 'chat' ? 6 : 10) || [],
    open_decisions: context.decisions?.filter((d: any) => d.status === 'open')?.slice(0, 8) || [],
    active_rules: context.rules?.filter((r: any) => (r.severity || 0) >= 3)?.slice(0, 8) || [],
    mood_trend: context.behavior?.slice(0, 5) || [],
    conversation: recentConversation,
    project_focus: sessionMemory?.active_project || null,
    session_memory: sessionMemory || null,
    relevant_decisions: context.decisions?.slice(0, 8) || [],
    integrations: context.integrations || [],
  };
}

export function buildSystemPrompt(context: any): string {
  const sections: string[] = [];

  if (context.session_memory) {
    const mem = context.session_memory;

    sections.push(
      [
        'SESSION WORKING MEMORY:',
        mem.active_project ? `- Active project: ${mem.active_project}` : '',
        mem.current_focus ? `- Current focus: ${mem.current_focus}` : '',
        mem.summary ? `- Session summary: ${mem.summary}` : '',
        mem.open_blockers?.length ? `- Open blockers: ${mem.open_blockers.join(' | ')}` : '',
        mem.decisions_made?.length ? `- Decisions made: ${mem.decisions_made.join(' | ')}` : '',
        mem.next_steps?.length ? `- Next steps: ${mem.next_steps.join(' | ')}` : '',
        mem.user_preferences?.length ? `- User preferences: ${mem.user_preferences.join(' | ')}` : '',
        mem.key_topics?.length ? `- Key topics: ${mem.key_topics.join(' | ')}` : '',
      ].filter(Boolean).join('\n')
    );
  }

  if (context.active_projects?.length) {
    sections.push(
      `ACTIVE PROJECTS: ${context.active_projects
        .map((p: any) => `${p.name} [id:${p.id}]`)
        .join(', ')}`
    );
  }

  if (context.current_tasks?.length) {
    sections.push(
      `CURRENT TASKS:\n${context.current_tasks
        .map((t: any) => `- [${t.status}] ${t.title} (priority: ${t.priority || 3})`)
        .join('\n')}`
    );
  }

  if (context.recent_updates?.length) {
    sections.push(
      `RECENT UPDATES:\n${context.recent_updates
        .map((u: any) => `- [${u.project_name || 'unknown'}] ${u.update_type}: ${u.content}`)
        .join('\n')}`
    );
  }

  if (context.open_decisions?.length) {
    sections.push(
      `OPEN DECISIONS:\n${context.open_decisions
        .map((d: any) => `- ${d.context} (${d.probability || '?'}% confidence)`)
        .join('\n')}`
    );
  }

  if (context.active_rules?.length) {
    sections.push(
      `ACTIVE RULES:\n${context.active_rules
        .map((r: any) => `- [severity ${r.severity}] ${r.content}`)
        .join('\n')}`
    );
  }

  if (context.mood_trend?.length) {
    sections.push(
      `RECENT MOOD: ${context.mood_trend
        .map((b: any) => `${b.mood} (stress: ${b.stress_level}/10)`)
        .join(', ')}`
    );
  }

  if (context.conversation?.length) {
    sections.push(
      `RECENT CONVERSATION:\n${context.conversation
        .map((m: any) => `- ${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
        .join('\n')}`
    );
  }

  return `You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY: Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Preserve continuity, avoid repeating solved setup, and stay anchored to the user's active project and current focus.

If session working memory exists, treat it as the best summary of the current thread.
If recent conversation conflicts with older memory, prefer the recent conversation.
Respond naturally in markdown. For actions (create task, log decision, etc.), end your response with [BUDDIES_ACTION] blocks.

${sections.join('\n\n')}`;
}

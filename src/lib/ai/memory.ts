export type MessageType = 'chat' | 'analysis' | 'decision';

export interface SessionMemory {
  active_project: string | null;
  active_project_id?: string | null;
  current_focus: string | null;
  open_blockers: string[];
  decisions_made: string[];
  next_steps: string[];
  user_preferences: string[];
  key_topics: string[];
  constraints?: string[];
  summary: string | null;
  summary_json?: Record<string, any> | null;
  turn_count?: number | null;
  message_type?: string | null;
}

export interface ProjectMemory {
  project_id: string;
  project_name?: string | null;
  purpose?: string | null;
  current_stage?: string | null;
  active_priorities?: any[];
  open_blockers?: any[];
  key_decisions?: any[];
  constraints?: any[];
  next_actions?: any[];
  summary_text?: string | null;
  summary_json?: Record<string, any> | null;
}

export interface MemoryItem {
  id: string;
  project_id?: string | null;
  session_id?: string | null;
  memory_type: string;
  title?: string | null;
  content: string;
  keywords?: string[] | null;
  importance?: number | null;
  severity?: number | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_used_at?: string | null;
}

export interface OrgMemoryItem {
  id: string;
  memory_type: string;
  content: string;
  importance?: number | null;
  status?: string | null;
  metadata?: Record<string, any> | null;
  updated_at?: string | null;
}

function textOf(value: any): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeHistory(history: any[]) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
}

export function detectMessageType(message: string): MessageType {
  const lower = message.toLowerCase();

  const analysisKeywords = [
    'analyze', 'analysis', 'pattern', 'insight', 'correlation',
    'trend', 'why', 'root cause', 'investigate', 'diagnose',
    'compare', 'review', 'evaluate'
  ];

  const decisionKeywords = [
    'decide', 'should i', 'choose', 'better', 'recommend',
    'which', 'tradeoff', 'option', 'pros and cons', 'best choice'
  ];

  if (decisionKeywords.some((k) => lower.includes(k))) return 'decision';
  if (analysisKeywords.some((k) => lower.includes(k))) return 'analysis';
  return 'chat';
}

export function uniq(items: string[]): string[] {
  return [...new Set(items.map((x) => x.trim()).filter(Boolean))];
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function overlapScore(a: string, b: string): number {
  const aa = new Set(tokenize(a));
  const bb = new Set(tokenize(b));
  let score = 0;
  for (const token of aa) {
    if (bb.has(token)) score += 1;
  }
  return score;
}

function recencyScore(dateLike?: string | null): number {
  if (!dateLike) return 0;
  const ts = new Date(dateLike).getTime();
  if (!Number.isFinite(ts)) return 0;

  const days = (Date.now() - ts) / 86400000;
  if (days <= 3) return 20;
  if (days <= 7) return 15;
  if (days <= 30) return 10;
  return 4;
}

export function detectProjectFocus(
  message: string,
  sessionSummary: string,
  contextNote: string,
  projects: Array<{ id?: string; name?: string | null }>,
  sessionMemory?: SessionMemory | null,
  projectMemory?: ProjectMemory | null
) {
  const haystack = `${message}\n${sessionSummary}\n${contextNote}\n${sessionMemory?.summary ?? ''}\n${sessionMemory?.active_project ?? ''}\n${projectMemory?.summary_text ?? ''}`.toLowerCase();

  if (sessionMemory?.active_project_id) {
    const byId = projects.find((p) => p.id === sessionMemory.active_project_id);
    if (byId) return byId;
  }

  if (sessionMemory?.active_project) {
    const byName = projects.find((p) => (p.name || '').toLowerCase() === sessionMemory.active_project!.toLowerCase());
    if (byName) return byName;
  }

  for (const p of projects) {
    const name = (p.name || '').trim().toLowerCase();
    if (!name) continue;
    if (haystack.includes(name)) return p;
  }

  return null;
}

export function rankMemoryItems(args: {
  query: string;
  messageType: MessageType;
  activeProjectId?: string | null;
  sessionId?: string | null;
  items?: MemoryItem[];
  orgItems?: OrgMemoryItem[];
}) {
  const { query, messageType, activeProjectId, sessionId } = args;
  const items = args.items ?? [];
  const orgItems = args.orgItems ?? [];

  const baseText = query.toLowerCase();

  const scored = items
    .filter((item) => (item.status || 'active') !== 'archived')
    .map((item) => {
      const text = `${item.title || ''} ${item.content} ${(item.keywords || []).join(' ')}`;
      const relevance = overlapScore(baseText, text) * 6;
      const importance = (item.importance || 0) * 3;
      const severity = (item.severity || 0) * 2;
      const recency = recencyScore(item.updated_at || item.created_at);
      const projectMatch = activeProjectId && item.project_id === activeProjectId ? 12 : 0;
      const sessionMatch = sessionId && item.session_id === sessionId ? 8 : 0;
      const typeBoost =
        messageType === 'decision' && item.memory_type === 'decision' ? 8 :
        messageType === 'analysis' && ['blocker', 'update', 'summary'].includes(item.memory_type) ? 6 :
        0;

      return { item, score: relevance + importance + severity + recency + projectMatch + sessionMatch + typeBoost };
    })
    .sort((a, b) => b.score - a.score);

  const orgScored = orgItems
    .filter((item) => (item.status || 'active') !== 'archived')
    .map((item) => {
      const relevance = overlapScore(baseText, item.content) * 5;
      const importance = (item.importance || 0) * 3;
      const recency = recencyScore(item.updated_at);
      return { item, score: relevance + importance + recency };
    })
    .sort((a, b) => b.score - a.score);

  const topByType = (type: string, count: number) =>
    scored.filter((x) => x.item.memory_type === type).slice(0, count).map((x) => x.item);

  return {
    decisions: topByType('decision', 3),
    blockers: topByType('blocker', 3),
    updates: topByType('update', 3),
    rules: topByType('rule', 2),
    summaries: topByType('summary', 2),
    general: scored.slice(0, 8).map((x) => x.item),
    org: orgScored.slice(0, 3).map((x) => x.item),
  };
}

export function buildSystemPrompt(context: {
  messageType: MessageType;
  sessionSummary?: string;
  contextNote?: string;
  focusedProject?: any | null;
  sessionMemory?: SessionMemory | null;
  projectMemory?: ProjectMemory | null;
  recentConversation?: Array<{ role: string; content: string }>;
  currentTasks?: any[];
  recentUpdates?: any[];
  recentDecisions?: any[];
  activeRules?: any[];
  openBlockers?: any[];
  ranked?: ReturnType<typeof rankMemoryItems>;
  integrations?: any[];
}) {
  const sections: string[] = [];

  sections.push(
`You are Buddies OS, a personal AI operating system for entrepreneurial and operational work.

Your job is to preserve continuity, reason from active project context, and answer like you are aware of ongoing work, constraints, blockers, decisions, and next steps.

Do not answer like a fresh chatbot unless context is truly missing.
Prefer concrete, operational answers over generic advice.
If recent conversation conflicts with older memory, prefer recent conversation.`
  );

  sections.push(`MESSAGE TYPE: ${context.messageType}`);

  if (context.focusedProject) {
    sections.push(
`FOCUSED PROJECT:
- name: ${context.focusedProject.name}
- status: ${context.focusedProject.status || 'unknown'}
- health: ${context.focusedProject.health || 'unknown'}
- current_focus: ${context.focusedProject.current_focus || 'n/a'}
- next_milestone: ${context.focusedProject.next_milestone || 'n/a'}`);
  }

  if (context.sessionMemory) {
    const mem = context.sessionMemory;
    sections.push(
`SESSION COMPACT:
- active_project: ${mem.active_project || 'n/a'}
- current_focus: ${mem.current_focus || 'n/a'}
- summary: ${mem.summary || 'n/a'}
- blockers: ${(mem.open_blockers || []).join(' | ') || 'none'}
- decisions: ${(mem.decisions_made || []).join(' | ') || 'none'}
- next_steps: ${(mem.next_steps || []).join(' | ') || 'none'}
- constraints: ${(mem.constraints || []).join(' | ') || 'none'}
- key_topics: ${(mem.key_topics || []).join(' | ') || 'none'}`);
  } else if (context.sessionSummary) {
    sections.push(`SESSION SUMMARY:\n${context.sessionSummary}`);
  }

  if (context.contextNote) {
    sections.push(`USER CONTEXT NOTE:\n${context.contextNote}`);
  }

  if (context.projectMemory) {
    const pm = context.projectMemory;
    sections.push(
`PROJECT COMPACT:
- purpose: ${pm.purpose || 'n/a'}
- current_stage: ${pm.current_stage || 'n/a'}
- summary: ${pm.summary_text || 'n/a'}
- active_priorities: ${textOf(pm.active_priorities || [])}
- open_blockers: ${textOf(pm.open_blockers || [])}
- key_decisions: ${textOf(pm.key_decisions || [])}
- constraints: ${textOf(pm.constraints || [])}
- next_actions: ${textOf(pm.next_actions || [])}`);
  }

  if (context.currentTasks?.length) {
    sections.push(
      `CURRENT TASKS:\n${context.currentTasks
        .map((t: any) => `- [${t.status}] ${t.title} (priority: ${t.priority || 3})`)
        .join('\n')}`
    );
  }

  if (context.recentUpdates?.length) {
    sections.push(
      `RECENT UPDATES:\n${context.recentUpdates
        .map((u: any) => `- [${u.project_name || u.projects?.name || 'unknown'}] ${u.update_type || 'update'}: ${u.content || ''}`)
        .join('\n')}`
    );
  }

  if (context.recentDecisions?.length) {
    sections.push(
      `RECENT DECISIONS:\n${context.recentDecisions
        .map((d: any) => `- ${d.context || d.title || 'decision'} (${d.verdict || d.status || 'unknown'})`)
        .join('\n')}`
    );
  }

  if (context.openBlockers?.length) {
    sections.push(
      `OPEN BLOCKERS:\n${context.openBlockers
        .map((b: any) => `- ${b.title || b.description || 'blocker'} [${b.status || 'open'}]`)
        .join('\n')}`
    );
  }

  if (context.activeRules?.length) {
    sections.push(
      `ACTIVE RULES:\n${context.activeRules
        .map((r: any) => `- [severity ${r.severity || 0}] ${r.rule_text || r.content || r.title || 'rule'}`)
        .join('\n')}`
    );
  }

  if (context.ranked?.general?.length) {
    sections.push(
      `RANKED MEMORY:\n${context.ranked.general
        .map((m: any) => `- [${m.memory_type}] ${m.title ? `${m.title}: ` : ''}${m.content}`)
        .join('\n')}`
    );
  }

  if (context.ranked?.org?.length) {
    sections.push(
      `SYSTEM MEMORY:\n${context.ranked.org
        .map((m: any) => `- [${m.memory_type}] ${m.content}`)
        .join('\n')}`
    );
  }

  if (context.recentConversation?.length) {
    sections.push(
      `RECENT CONVERSATION:\n${context.recentConversation
        .map((m: any) => `- ${m.role}: ${m.content}`)
        .join('\n')}`
    );
  }

  return sections.join('\n\n');
}


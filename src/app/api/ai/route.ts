import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

// Model pricing (per million tokens)
const MODEL_COSTS = {
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
  'claude-3-opus-20240229': { input: 15, output: 75 }
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS['claude-3-5-sonnet-20241022'];
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

// Detect message intent for smart context loading
function detectMessageType(message: string): 'chat' | 'analysis' | 'decision' {
  const analysisKeywords = ['analyze', 'pattern', 'insight', 'correlation', 'trend', 'why', 'show me', 'what does'];
  const decisionKeywords = ['decide', 'should I', 'choose', 'better', 'recommend', 'which', 'help me decide'];
  
  const lower = message.toLowerCase();
  
  if (decisionKeywords.some(k => lower.includes(k))) return 'decision';
  if (analysisKeywords.some(k => lower.includes(k))) return 'analysis';
  
  return 'chat';
}

// Smart context compression based on message type
function compressContext(context: any, messageType: 'chat' | 'analysis' | 'decision') {
  // Base context (always included)
  const base = {
    active_projects: context.projects?.filter((p: any) => p.status === 'active') || [],
    current_tasks: context.tasks
      ?.filter((t: any) => t.status === 'in_progress' || (t.priority && t.priority >= 4))
      ?.slice(0, 15) || [],
    recent_updates: context.updates?.slice(0, 7) || [],
    open_decisions: context.decisions?.filter((d: any) => d.status === 'open') || [],
    active_rules: context.rules?.filter((r: any) => (r.severity || 0) >= 3) || [],
    mood_trend: context.behavior?.slice(0, 3) || [],
    conversation: context.history?.slice(-5) || []
  };

  // Expand context for deep work
  if (messageType === 'analysis' || messageType === 'decision') {
    return {
      ...base,
      all_projects: context.projects || [],
      all_decisions: context.decisions?.slice(0, 10) || [],
      behavior_week: context.behavior?.slice(0, 7) || [],
      conversation: context.history?.slice(-10) || [],
      integrations: context.integrations || []
    };
  }

  // Minimal context for quick chat
  return base;
}

// Build system prompt from context
function buildSystemPrompt(context: any): string {
  const sections = [];

  if (context.active_projects?.length) {
    sections.push(`ACTIVE PROJECTS: ${context.active_projects.map((p: any) => 
      \`\${p.name} [id:\${p.id}]\`
    ).join(', ')}`);
  }

  if (context.current_tasks?.length) {
    sections.push(`CURRENT TASKS:\n${context.current_tasks.map((t: any) => 
      \`- [\${t.status}] \${t.title} (priority: \${t.priority || 3})\`
    ).join('\n')}`);
  }

  if (context.recent_updates?.length) {
    sections.push(`RECENT UPDATES:\n${context.recent_updates.map((u: any) => 
      \`- [\${u.project_name || 'unknown'}] \${u.update_type}: \${u.content}\`
    ).join('\n')}`);
  }

  if (context.open_decisions?.length) {
    sections.push(`OPEN DECISIONS:\n${context.open_decisions.map((d: any) => 
      \`- \${d.context} (\${d.probability || '?'}% confidence)\`
    ).join('\n')}`);
  }

  if (context.active_rules?.length) {
    sections.push(`ACTIVE RULES:\n${context.active_rules.map((r: any) => 
      \`- [severity \${r.severity}] \${r.content}\`
    ).join('\n')}`);
  }

  if (context.mood_trend?.length) {
    sections.push(`RECENT MOOD: ${context.mood_trend.map((b: any) => 
      \`\${b.mood} (stress: \${b.stress_level}/10)\`
    ).join(', ')}`);
  }

  return \`You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY: Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Surface intelligence, let the human decide.

\${sections.join('\n\n')}

Respond naturally in markdown. For actions (create task, log decision, etc.), end your response with [BUDDIES_ACTION] blocks.\`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, model: requestedModel } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Get user's model preference
    const { data: config } = await supabase
      .from('ai_model_config')
      .select('default_model, auto_select')
      .eq('user_id', user.id)
      .single();

    const messageType = detectMessageType(message);
    
    // Auto-select model based on message type if enabled
    let model = requestedModel || config?.default_model || 'claude-3-5-sonnet-20241022';
    
    if (config?.auto_select && !requestedModel) {
      if (messageType === 'chat') model = 'claude-3-5-haiku-20241022';
      if (messageType === 'analysis') model = 'claude-3-5-sonnet-20241022';
      if (messageType === 'decision') model = 'claude-3-5-sonnet-20241022';
    }

    // Fetch user context
    const [projects, tasks, updates, decisions, rules, behavior, history, integrations] = await Promise.all([
      supabase.from('projects').select('*').eq('user_id', user.id),
      supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('project_updates').select('*, projects(name)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('decisions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('rules').select('*').eq('user_id', user.id),
      supabase.from('behavior_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(7),
      supabase.from('ai_sessions').select('messages').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('integrations').select('*').eq('user_id', user.id)
    ]);

    const rawContext = {
      projects: projects.data || [],
      tasks: tasks.data || [],
      updates: updates.data?.map(u => ({ ...u, project_name: u.projects?.name })) || [],
      decisions: decisions.data || [],
      rules: rules.data || [],
      behavior: behavior.data || [],
      history: history.data?.[0]?.messages || [],
      integrations: integrations.data || []
    };

    // Compress context based on message type
    const context = compressContext(rawContext, messageType);
    const systemPrompt = buildSystemPrompt(context);

    // Call Claude API with streaming
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const stream = await anthropic.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    let inputTokens = 0;
    let outputTokens = 0;

    // Create readable stream
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            const text = chunk.delta.text;
            controller.enqueue(new TextEncoder().encode(text));
          }
          
          if (chunk.type === 'message_start') {
            inputTokens = chunk.message.usage.input_tokens;
          }
          
          if (chunk.type === 'message_delta') {
            outputTokens = chunk.usage.output_tokens;
          }
        }

        // Log usage after completion
        const cost = calculateCost(model, inputTokens, outputTokens);
        
        await supabase.from('ai_usage').insert({
          user_id: user.id,
          model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: cost,
          message_type: messageType
        });

        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

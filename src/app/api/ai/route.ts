import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import {
  buildSystemPrompt,
  compressContext,
  detectMessageType,
  detectProjectFocus,
} from '@/lib/ai/memory';

const MODEL_COSTS = {
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
  'claude-opus-4-1': { input: 15, output: 75 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs =
    MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS['claude-sonnet-4-5'];
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
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

    const requestedModel = body.model;
    const streamRequested = body.stream === true;
    const sessionId = body.sessionId ?? null;

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const { data: config } = await supabase
      .from('ai_model_config')
      .select('default_model, auto_select')
      .eq('user_id', user.id)
      .single();

    const messageType = detectMessageType(message);

    let model = requestedModel || config?.default_model || 'claude-sonnet-4-5';

    if (config?.auto_select && !requestedModel) {
      if (messageType === 'chat') model = 'claude-haiku-4-5-20251001';
      if (messageType === 'analysis') model = 'claude-sonnet-4-5';
      if (messageType === 'decision') model = 'claude-sonnet-4-5';
    }

    const [projects, tasks, updates, decisions, rules, behavior, history, integrations, sessionMemoryRow] =
      await Promise.all([
        supabase.from('projects').select('*').eq('user_id', user.id),
        supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase
          .from('project_updates')
          .select('*, projects(name)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('decisions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('rules').select('*').eq('user_id', user.id),
        supabase.from('behavior_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(7),
        supabase.from('ai_sessions').select('messages').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('integrations').select('*').eq('user_id', user.id),
        sessionId
          ? supabase
              .from('ai_session_memory')
              .select('*')
              .eq('user_id', user.id)
              .eq('session_id', sessionId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

    const existingSessionMemory = sessionMemoryRow?.data || null;
    const projectFocus = detectProjectFocus(
      message,
      projects.data || [],
      existingSessionMemory?.active_project || null
    );

    const rawContext = {
      projects: projects.data || [],
      tasks: tasks.data || [],
      updates: updates.data?.map((u: any) => ({ ...u, project_name: u.projects?.name })) || [],
      decisions: decisions.data || [],
      rules: rules.data || [],
      behavior: behavior.data || [],
      history: history.data?.[0]?.messages || [],
      integrations: integrations.data || [],
    };

    const sessionMemory = existingSessionMemory
      ? {
          active_project: projectFocus || existingSessionMemory.active_project || null,
          current_focus: existingSessionMemory.current_focus || null,
          open_blockers: existingSessionMemory.open_blockers || [],
          decisions_made: existingSessionMemory.decisions_made || [],
          next_steps: existingSessionMemory.next_steps || [],
          user_preferences: existingSessionMemory.user_preferences || [],
          key_topics: existingSessionMemory.key_topics || [],
          summary: existingSessionMemory.summary || null,
        }
      : {
          active_project: projectFocus,
          current_focus: null,
          open_blockers: [],
          decisions_made: [],
          next_steps: [],
          user_preferences: [],
          key_topics: [],
          summary: null,
        };

    const context = compressContext(rawContext, messageType, sessionMemory);
    const systemPrompt = buildSystemPrompt(context);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    if (streamRequested) {
      const stream = await anthropic.messages.stream({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(chunk.delta.text));
              }
            }

            const finalMessage = await stream.finalMessage();
            const inputTokens = finalMessage.usage?.input_tokens || 0;
            const outputTokens = finalMessage.usage?.output_tokens || 0;
            const cost = calculateCost(model, inputTokens, outputTokens);

            await supabase.from('ai_usage').insert({
              user_id: user.id,
              model,
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_usd: cost,
              message_type: messageType,
              session_id: sessionId,
            });

            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          'x-context-used': '1',
          'x-web-search-used': '0',
          'x-project-focus': projectFocus || '',
        },
      });
    }

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const text =
      response.content
        ?.filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('') || '';

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const cost = calculateCost(model, inputTokens, outputTokens);

    await supabase.from('ai_usage').insert({
      user_id: user.id,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      message_type: messageType,
      session_id: sessionId,
    });

    return NextResponse.json({
      response: text,
      content: text,
      contextUsed: true,
      webSearchUsed: false,
      projectFocus,
    });
  } catch (error: any) {
    console.error('AI API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

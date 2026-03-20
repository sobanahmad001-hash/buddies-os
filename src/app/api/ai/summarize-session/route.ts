import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callAIProvider } from '@/lib/ai/providers';

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

    const { messages, sessionId } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    const transcript = messages
      .slice(-20)
      .map((m: any) => `${m.role}: ${m.content}`)
      .join('\n');

    const aiResult = await callAIProvider({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      system: 'You are a structured summarizer. Return only valid JSON, no prose.',
      messages: [
        {
          role: 'user',
          content: `Summarize this Buddies OS conversation into strict JSON.

Return ONLY valid JSON with this shape:
{
  "active_project": string | null,
  "current_focus": string | null,
  "open_blockers": string[],
  "decisions_made": string[],
  "next_steps": string[],
  "user_preferences": string[],
  "key_topics": string[],
  "constraints": string[],
  "summary": string | null
}

Conversation:
${transcript}`,
        },
      ],
      maxTokens: 1200,
    });

    const text = aiResult.text || '{}';

    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        active_project: null,
        current_focus: null,
        open_blockers: [],
        decisions_made: [],
        next_steps: [],
        user_preferences: [],
        key_topics: [],
        constraints: [],
        summary: text.slice(0, 1000),
      };
    }

    let activeProjectId: string | null = null;
    if (parsed.active_project) {
      const { data: project } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', user.id)
        .ilike('name', parsed.active_project)
        .maybeSingle();

      activeProjectId = project?.id || null;
    }

    if (sessionId) {
      await supabase.from('ai_session_memory').upsert({
        user_id: user.id,
        session_id: sessionId,
        active_project: parsed.active_project || null,
        active_project_id: activeProjectId,
        current_focus: parsed.current_focus || null,
        open_blockers: parsed.open_blockers || [],
        decisions_made: parsed.decisions_made || [],
        next_steps: parsed.next_steps || [],
        user_preferences: parsed.user_preferences || [],
        key_topics: parsed.key_topics || [],
        constraints: parsed.constraints || [],
        summary: parsed.summary || null,
        summary_json: {
          active_project: parsed.active_project || null,
          current_focus: parsed.current_focus || null,
          open_blockers: parsed.open_blockers || [],
          decisions_made: parsed.decisions_made || [],
          next_steps: parsed.next_steps || [],
          user_preferences: parsed.user_preferences || [],
          key_topics: parsed.key_topics || [],
          constraints: parsed.constraints || [],
          summary: parsed.summary || null,
        },
        updated_at: new Date().toISOString(),
        last_meaningful_turn_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Summarize Session Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


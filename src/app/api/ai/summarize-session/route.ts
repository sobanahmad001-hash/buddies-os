import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

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

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const transcript = messages
      .slice(-20)
      .map((m: any) => `${m.role}: ${m.content}`)
      .join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      temperature: 0,
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
  "summary": string | null
}

Conversation:
${transcript}`,
        },
      ],
    });

    const text =
      response.content
        ?.filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('') || '{}';

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
        summary: text.slice(0, 1000),
      };
    }

    if (sessionId) {
      await supabase.from('ai_session_memory').upsert({
        user_id: user.id,
        session_id: sessionId,
        active_project: parsed.active_project || null,
        current_focus: parsed.current_focus || null,
        open_blockers: parsed.open_blockers || [],
        decisions_made: parsed.decisions_made || [],
        next_steps: parsed.next_steps || [],
        user_preferences: parsed.user_preferences || [],
        key_topics: parsed.key_topics || [],
        summary: parsed.summary || null,
        updated_at: new Date().toISOString(),
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

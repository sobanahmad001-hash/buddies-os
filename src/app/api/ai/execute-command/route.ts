import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { type, data } = await request.json();

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(s: { name: string; value: string; options?: object }[]) {
            s.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const findProjectId = (projectName: string | null): string | null => {
      if (!projectName || !projects) return null;
      const found = projects.find(p =>
        p.name.toLowerCase().includes(projectName.toLowerCase()) ||
        projectName.toLowerCase().includes(p.name.toLowerCase())
      );
      return found?.id ?? null;
    };

    let response = '';

    switch (type) {
      case 'mood': {
        await supabase.from('behavior_logs').insert({
          user_id: user.id,
          mood_tag: data.mood ?? null,
          stress: data.stress ?? null,
          sleep_hours: data.sleep ?? null,
          timestamp: new Date().toISOString(),
        });

        const parts: string[] = [];
        if (data.mood) parts.push(`mood: ${data.mood}`);
        if (data.stress !== undefined && data.stress !== null) parts.push(`stress: ${data.stress}/10`);
        if (data.sleep !== undefined && data.sleep !== null) parts.push(`sleep: ${data.sleep}h`);
        response = `✅ Logged — ${parts.join(', ')}`;
        break;
      }

      case 'decision': {
        const projectId = findProjectId(data.project ?? null);
        const verdict = (data.status ?? 'WAIT').toUpperCase();

        await supabase.from('decisions').insert({
          user_id: user.id,
          project_id: projectId,
          context: data.decision,
          verdict,
          probability: data.confidence ?? null,
          domain: 'general',
        });

        const emoji = verdict === 'GO' ? '✅' : verdict === 'NO-GO' ? '🚫' : '⏳';
        response = `${emoji} Decision logged — **${verdict}**${
          data.confidence ? ` (${data.confidence}% confidence)` : ''
        }: "${data.decision}"${data.project ? ` for ${data.project}` : ''}`;
        break;
      }

      case 'blocker': {
        const blockerProjectId = findProjectId(data.project ?? null);

        await supabase.from('project_updates').insert({
          user_id: user.id,
          project_id: blockerProjectId,
          update_type: 'blocker',
          content: data.content,
        });

        response = `🚧 Blocker logged: "${data.content}"${
          data.project ? ` for ${data.project}` : ''
        }`;
        break;
      }

      case 'task': {
        const taskProjectId = findProjectId(data.project ?? null);

        await supabase.from('project_tasks').insert({
          user_id: user.id,
          project_id: taskProjectId,
          title: data.title,
          status: 'todo',
          priority: 2,
        });

        response = `✅ Task created: "${data.title}"${
          data.project ? ` for ${data.project}` : ''
        }`;
        break;
      }

      case 'rule': {
        await supabase.from('rules').insert({
          user_id: user.id,
          rule_text: data.rule,
          severity: data.severity ?? 2,
          active: true,
          domain: 'general',
        });

        response = `📋 Rule saved (severity ${data.severity ?? 2}): "${data.rule}"`;
        break;
      }

      case 'update': {
        const updateProjectId = findProjectId(data.project ?? null);
        const updateType = data.type ?? 'progress';

        await supabase.from('project_updates').insert({
          user_id: user.id,
          project_id: updateProjectId,
          update_type: updateType,
          content: data.content,
        });

        response = `📈 Update logged (${updateType}): "${data.content}"${
          data.project ? ` for ${data.project}` : ''
        }`;
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown command type' }, { status: 400 });
    }

    return NextResponse.json({ success: true, response });
  } catch (error) {
    console.error('Command execution error:', error);
    return NextResponse.json({ error: 'Failed to execute command' }, { status: 500 });
  }
}

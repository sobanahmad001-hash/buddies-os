import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

async function getSupabase() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return c.getAll(); },
        setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); }
      }
    }
  );
}

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wsMap: Record<string, any> = {};

  // 1. Via memberships (works for team members AND owners who have a membership row)
  const { data: memberships } = await supabase
    .from('memberships')
    .select('workspace_id, role, workspaces(id, name, slug, owner_id)')
    .eq('user_id', user.id)
    .eq('status', 'active');

  for (const m of (memberships ?? [])) {
    const w = (m as any).workspaces;
    if (w?.id && !wsMap[w.id]) {
      wsMap[w.id] = { ...w, role: m.role };
    }
  }

  // 2. Via direct ownership (fallback: owner may not have a membership row)
  const { data: ownedWs } = await supabase
    .from('workspaces')
    .select('id, name, slug, owner_id')
    .eq('owner_id', user.id);

  for (const w of (ownedWs ?? [])) {
    if (w?.id && !wsMap[w.id]) {
      wsMap[w.id] = { ...w, role: 'owner' };
    }
  }

  return NextResponse.json(Object.values(wsMap));
}

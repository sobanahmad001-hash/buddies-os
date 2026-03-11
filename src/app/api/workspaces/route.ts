import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: memberships, error } = await supabase
    .from('memberships')
    .select('workspace_id, role, workspaces(id, name, slug, owner_id)')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const workspaces = (memberships || []).map((m: any) => ({
    ...m.workspaces,
    role: m.role,
  }));

  return NextResponse.json(workspaces);
}

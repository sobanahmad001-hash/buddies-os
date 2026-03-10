import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ updates: [] });

  // Find which workspace this user belongs to
  let memberUserIds: string[] = [user.id];
  let workspaceName: string | null = null;

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", user.id)
    .single();

  if (ws) {
    workspaceName = ws.name;
    const { data: members } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("workspace_id", ws.id)
      .eq("status", "active");
    memberUserIds = [...new Set([user.id, ...(members ?? []).map((m: any) => m.user_id)])];
  } else {
    // Check if they're a member of someone else's workspace
    const { data: membership } = await supabase
      .from("memberships")
      .select("workspace_id, workspaces(id, name, owner_id)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (membership) {
      const wsData = (membership as any).workspaces;
      workspaceName = wsData?.name ?? null;
      const { data: members } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("workspace_id", membership.workspace_id)
        .eq("status", "active");
      memberUserIds = [...new Set([wsData?.owner_id, user.id, ...(members ?? []).map((m: any) => m.user_id)].filter(Boolean))];
    }
  }

  // Get recent project_updates from all workspace members
  const { data: updates } = await supabase
    .from("project_updates")
    .select("id, content, update_type, next_actions, created_at, user_id, project_id, projects(name)")
    .in("user_id", memberUserIds)
    .order("created_at", { ascending: false })
    .limit(20);

  // Get recent tasks from all workspace members
  const { data: tasks } = await supabase
    .from("project_tasks")
    .select("id, title, status, created_at, user_id, project_id, projects(name)")
    .in("user_id", memberUserIds)
    .order("created_at", { ascending: false })
    .limit(20);

  // Get profile display names for all member user_ids
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", memberUserIds);

  const profileMap: Record<string, any> = {};
  (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

  // Merge and sort all activity
  const activity = [
    ...(updates ?? []).map((u: any) => ({
      id: `u-${u.id}`,
      kind: "update" as const,
      content: u.content,
      update_type: u.update_type,
      project: (u.projects as any)?.name ?? null,
      project_id: u.project_id,
      created_at: u.created_at,
      user_id: u.user_id,
      is_own: u.user_id === user.id,
      author: profileMap[u.user_id]?.full_name ?? (u.user_id === user.id ? "You" : "Team"),
    })),
    ...(tasks ?? []).map((t: any) => ({
      id: `t-${t.id}`,
      kind: "task" as const,
      content: t.title,
      update_type: null,
      project: (t.projects as any)?.name ?? null,
      project_id: t.project_id,
      created_at: t.created_at,
      user_id: t.user_id,
      is_own: t.user_id === user.id,
      author: profileMap[t.user_id]?.full_name ?? (t.user_id === user.id ? "You" : "Team"),
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 25);

  return NextResponse.json({ updates: activity, workspaceName });
}

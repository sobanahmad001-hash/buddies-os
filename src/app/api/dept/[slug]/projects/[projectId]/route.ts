import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getClient() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

async function resolveDeptProject(supabase: any, slug: string, projectId: string, userId: string) {
  const { data: ownedWs } = await supabase.from("workspaces").select("id").eq("owner_id", userId).maybeSingle();
  let workspaceId: string | null = null;
  if (ownedWs) {
    workspaceId = ownedWs.id;
  } else {
    const { data: mem } = await supabase
      .from("memberships")
      .select("workspace_id, department_id, departments(slug)")
      .eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!mem || (mem as any).departments?.slug !== slug) return null;
    workspaceId = mem.workspace_id;
  }
  const { data: dept } = await supabase.from("departments").select("id").eq("workspace_id", workspaceId).eq("slug", slug).maybeSingle();
  if (!dept) return null;
  const { data: project } = await supabase.from("dept_projects").select("*").eq("id", projectId).eq("dept_id", dept.id).maybeSingle();
  return project ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const project = await resolveDeptProject(supabase, slug, projectId, user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [taskRes, updateRes, memberRes] = await Promise.all([
    supabase.from("dept_project_tasks").select("*").eq("dept_project_id", projectId).neq("status", "cancelled").order("created_at"),
    supabase.from("dept_project_updates").select("id, content, update_type, created_at, user_id, profiles(full_name)").eq("dept_project_id", projectId).order("created_at", { ascending: false }).limit(20),
    supabase.from("memberships").select("user_id, role, profiles(full_name, avatar_url)").eq("department_id", project.dept_id).eq("status", "active"),
  ]);

  return NextResponse.json({
    project,
    tasks:   taskRes.data ?? [],
    updates: updateRes.data ?? [],
    members: memberRes.data ?? [],
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const project = await resolveDeptProject(supabase, slug, projectId, user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "description", "status"];
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];

  const { data, error } = await supabase.from("dept_projects").update(updates).eq("id", projectId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const project = await resolveDeptProject(supabase, slug, projectId, user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase.from("dept_projects").delete().eq("id", projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

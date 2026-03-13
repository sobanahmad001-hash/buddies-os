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

async function resolveDept(supabase: any, slug: string, userId: string) {
  const { data: ownedWs } = await supabase.from("workspaces").select("id").eq("owner_id", userId).maybeSingle();
  if (ownedWs) {
    const { data: dept } = await supabase.from("departments").select("*").eq("workspace_id", ownedWs.id).eq("slug", slug).maybeSingle();
    return { dept, workspaceId: ownedWs.id };
  }
  const { data: mem } = await supabase
    .from("memberships")
    .select("workspace_id, department_id, departments(id, slug, name, workspace_id)")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!mem) return { dept: null, workspaceId: null };
  const dept = (mem as any).departments;
  if (!dept || dept.slug !== slug) return { dept: null, workspaceId: null };
  return { dept, workspaceId: mem.workspace_id };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await supabase.from("dept_project_tasks")
    .select("*")
    .eq("dept_project_id", projectId)
    .neq("status", "cancelled")
    .order("created_at");

  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, priority = "medium", due_date, assigned_to } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase.from("dept_project_tasks").insert({
    dept_project_id: projectId,
    dept_id: dept.id,
    created_by: user.id,
    title: title.trim(),
    description: description?.trim() ?? null,
    priority,
    due_date: due_date ?? null,
    assigned_to: assigned_to ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { taskId, status, assigned_to, title, description, priority } = await req.json();
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (status      !== undefined) updates.status      = status;
  if (assigned_to !== undefined) updates.assigned_to = assigned_to;
  if (title       !== undefined) updates.title       = title;
  if (description !== undefined) updates.description = description;
  if (priority    !== undefined) updates.priority    = priority;

  const { data, error } = await supabase.from("dept_project_tasks")
    .update(updates).eq("id", taskId).eq("dept_id", dept.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { taskId } = await req.json();
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const { error } = await supabase.from("dept_project_tasks").update({ status: "cancelled" }).eq("id", taskId).eq("dept_id", dept.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

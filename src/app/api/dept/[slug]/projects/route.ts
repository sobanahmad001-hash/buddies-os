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
  // Owner: any dept in their workspace
  const { data: ownedWs } = await supabase.from("workspaces").select("id").eq("owner_id", userId).maybeSingle();
  if (ownedWs) {
    const { data: dept } = await supabase.from("departments").select("*").eq("workspace_id", ownedWs.id).eq("slug", slug).maybeSingle();
    return { dept, workspaceId: ownedWs.id };
  }
  // Member: only their assigned dept
  const { data: mem } = await supabase
    .from("memberships")
    .select("workspace_id, department_id, departments(id, slug, name, workspace_id)")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!mem) return { dept: null, workspaceId: null };
  const dept = (mem as any).departments;
  if (!dept || dept.slug !== slug) return { dept: null, workspaceId: null };
  return { dept, workspaceId: mem.workspace_id };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Department not found or access denied" }, { status: 403 });

  const { data } = await supabase
    .from("dept_projects").select("*").eq("dept_id", dept.id)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept, workspaceId } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Department not found or access denied" }, { status: 403 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase.from("dept_projects").insert({
    dept_id: dept.id,
    workspace_id: workspaceId,
    created_by: user.id,
    name: name.trim(),
    description: description?.trim() || null,
    status: "active",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}

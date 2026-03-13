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
    return dept;
  }
  const { data: mem } = await supabase
    .from("memberships")
    .select("departments(id, slug, name, workspace_id)")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!mem) return null;
  const dept = (mem as any).departments;
  return dept?.slug === slug ? dept : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!await resolveDept(supabase, slug, user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await supabase.from("dept_project_research")
    .select("id, topic, notes, created_at, user_id, profiles(full_name)")
    .eq("dept_project_id", projectId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ research: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!await resolveDept(supabase, slug, user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { topic, notes } = await req.json();
  if (!topic?.trim() || !notes?.trim()) return NextResponse.json({ error: "topic and notes required" }, { status: 400 });

  const { data, error } = await supabase.from("dept_project_research").insert({
    dept_project_id: projectId,
    user_id: user.id,
    topic: topic.trim(),
    notes: notes.trim(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!await resolveDept(supabase, slug, user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("dept_project_research").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

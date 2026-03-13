import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { resolveDeptForUser } from "@/lib/departments";

async function getClient() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDeptForUser(supabase, slug, user.id);
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

  const { dept, workspaceId } = await resolveDeptForUser(supabase, slug, user.id);
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

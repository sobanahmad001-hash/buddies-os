import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tasks: [] });

  const projectId = req.nextUrl.searchParams.get("projectId");
  let query = supabase.from("project_tasks").select("*").eq("user_id", user.id).order("priority", { ascending: true }).order("due_date", { ascending: true });
  if (projectId) query = query.eq("project_id", projectId);

  const { data } = await query;
  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { project_id, title, description, priority, due_date, source_message_id } = body;
  if (!project_id || !title) return NextResponse.json({ error: "project_id and title required" }, { status: 400 });

  const { data, error } = await supabase.from("project_tasks").insert({
    user_id: user.id, project_id, title, description, priority: priority ?? 2,
    due_date: due_date ?? null, source_message_id: source_message_id ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase.from("project_tasks")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();
  await supabase.from("project_tasks").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ deleted: true });
}

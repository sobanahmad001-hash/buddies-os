import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

// GET /api/marketing/tasks?client_id=<uuid>&status=<status>&category=<cat>
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const client_id = req.nextUrl.searchParams.get("client_id");
  const status    = req.nextUrl.searchParams.get("status");
  const category  = req.nextUrl.searchParams.get("category");
  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  let q = supabase
    .from("marketing_tasks")
    .select("id, client_id, task_description, assigned_to, due_date, status, priority, category, created_at")
    .eq("client_id", client_id)
    .order("created_at", { ascending: false });

  if (status)   q = q.eq("status", status);
  if (category) q = q.eq("category", category);

  const { data, error } = await q.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}

// POST /api/marketing/tasks
// Body: { client_id, task_description, assigned_to?, due_date?, priority?, category? }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { client_id, task_description, assigned_to, due_date, priority, category } = body;
  if (!client_id || !task_description?.trim()) {
    return NextResponse.json({ error: "client_id and task_description are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("marketing_tasks")
    .insert({
      client_id,
      task_description: task_description.trim(),
      assigned_to: assigned_to ?? null,
      due_date: due_date ?? null,
      status: "in_progress",
      priority: priority ?? "medium",
      category: category ?? null,
      created_by: user.id,
    })
    .select("id, client_id, task_description, assigned_to, due_date, status, priority, category")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

// PATCH /api/marketing/tasks — update status, priority, etc.
// Body: { id, ...fields }
export async function PATCH(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("marketing_tasks").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

// DELETE /api/marketing/tasks — Body: { id }
export async function DELETE(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("marketing_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function db() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: values => values.forEach(({ name, value, options }) => store.set(name, value, options)) },
  });
}

export async function GET(req: NextRequest) {
  const supabase = await db(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ dependencies: [] });
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ dependencies: [] });
  const { data: tasks } = await supabase.from("project_tasks").select("id").eq("user_id", user.id).eq("project_id", projectId);
  const ids = (tasks ?? []).map(task => task.id); if (!ids.length) return NextResponse.json({ dependencies: [] });
  const { data } = await supabase.from("task_dependencies").select("task_id,depends_on_task_id").eq("user_id", user.id).in("task_id", ids);
  return NextResponse.json({ dependencies: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await db(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { task_id, depends_on_task_id } = await req.json();
  if (!task_id || !depends_on_task_id || task_id === depends_on_task_id) return NextResponse.json({ error: "Invalid dependency" }, { status: 400 });
  const { error } = await supabase.from("task_dependencies").upsert({ user_id: user.id, task_id, depends_on_task_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await db(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { task_id, depends_on_task_id } = await req.json();
  await supabase.from("task_dependencies").delete().eq("user_id", user.id).eq("task_id", task_id).eq("depends_on_task_id", depends_on_task_id);
  return NextResponse.json({ ok: true });
}

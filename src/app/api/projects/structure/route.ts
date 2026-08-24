import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (values: any[]) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  );
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const [project, workstreams, deliverables] = await Promise.all([
    supabase.from("projects").select("id,owner_name,target_date,health").eq("id", projectId).eq("user_id", user.id).single(),
    supabase.from("project_workstreams").select("*").eq("project_id", projectId).eq("user_id", user.id).order("created_at"),
    supabase.from("project_deliverables").select("*").eq("project_id", projectId).eq("user_id", user.id).order("due_date"),
  ]);
  const error = project.error || workstreams.error || deliverables.error;
  if (error) return NextResponse.json({ error: error.message, migrationRequired: error.message.includes("schema cache") || error.message.includes("does not exist") }, { status: 500 });
  return NextResponse.json({ project: project.data, workstreams: workstreams.data ?? [], deliverables: deliverables.data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { kind, projectId, ...fields } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const table = kind === "deliverable" ? "project_deliverables" : "project_workstreams";
  const { data, error } = await supabase.from(table).insert({ ...fields, project_id: projectId, user_id: user.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { kind, id, projectId, ...fields } = await req.json();
  if (kind === "project") {
    const { error } = await supabase.from("projects").update(fields).eq("id", projectId).eq("user_id", user.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ updated: true });
  }
  const table = kind === "deliverable" ? "project_deliverables" : "project_workstreams";
  const { error } = await supabase.from(table).update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ updated: true });
}

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

// GET /api/documents?department_id=&project_id=&status=
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ documents: [] });

  const { searchParams } = req.nextUrl;
  const department_id = searchParams.get("department_id");
  const project_id    = searchParams.get("project_id");
  const status        = searchParams.get("status");

  // Get user's workspace_id
  const { data: mem } = await supabase
    .from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  const { data: ws } = await supabase
    .from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  const workspace_id = ws?.id ?? mem?.workspace_id ?? null;

  let q = supabase
    .from("documents")
    .select("id, title, status, department_id, project_id, owner_id, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (workspace_id) q = q.eq("workspace_id", workspace_id);
  if (department_id) q = q.eq("department_id", department_id);
  if (project_id)    q = q.eq("project_id", project_id);
  if (status)        q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

// POST /api/documents
// Body: { title, content?, department_id?, project_id?, status? }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // Resolve workspace
  const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  const { data: mem } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  const workspace_id = ws?.id ?? mem?.workspace_id ?? null;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      title,
      content:       body.content ?? "",
      status:        body.status ?? "draft",
      owner_id:      user.id,
      workspace_id,
      department_id: body.department_id ?? null,
      project_id:    body.project_id ?? null,
    })
    .select("id, title, status, content, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ document: data }, { status: 201 });
}

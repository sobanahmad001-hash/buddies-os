import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return c.getAll(); },
        setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); },
      },
    }
  );
}

function maskKey(val: string): string {
  if (!val || val.length <= 8) return "****";
  return val.slice(0, 6) + "****" + val.slice(-4);
}

// GET /api/dev/supabase/projects?department_id=<uuid>
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const department_id = req.nextUrl.searchParams.get("department_id");
  if (!department_id) return NextResponse.json({ error: "department_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("supabase_integrations")
    .select("id, project_name, project_url, anon_key, service_role_key, created_at")
    .eq("department_id", department_id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

// POST /api/dev/supabase/projects
// Body: { department_id, project_name, project_url, anon_key, service_role_key? }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { department_id, project_name, project_url, anon_key, service_role_key } = body;

  if (!department_id || !project_name?.trim() || !project_url?.trim() || !anon_key?.trim()) {
    return NextResponse.json(
      { error: "department_id, project_name, project_url, and anon_key are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("supabase_integrations")
    .insert({
      department_id,
      user_id: user.id,
      project_name: project_name.trim(),
      project_url: project_url.trim(),
      anon_key: maskKey(anon_key.trim()),
      service_role_key: service_role_key?.trim() ? maskKey(service_role_key.trim()) : null,
    })
    .select("id, project_name, project_url, anon_key, service_role_key, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data }, { status: 201 });
}

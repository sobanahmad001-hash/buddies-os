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

// GET /api/dev/tools?department_id=<uuid>
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const department_id = req.nextUrl.searchParams.get("department_id");
  if (!department_id) return NextResponse.json({ error: "department_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("development_environment")
    .select("id, name, tool_type, config, created_at")
    .eq("department_id", department_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tools: data ?? [] });
}

// POST /api/dev/tools
// Body: { department_id, tool_type, name, config? }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { department_id, tool_type, name, config } = body;

  if (!department_id || !tool_type || !name?.trim()) {
    return NextResponse.json({ error: "department_id, tool_type, and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("development_environment")
    .insert({ department_id, tool_type, name: name.trim(), config: config ?? {} })
    .select("id, name, tool_type, config, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tool: data }, { status: 201 });
}

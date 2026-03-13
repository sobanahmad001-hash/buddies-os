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

// GET /api/dev/github/repos?department_id=<uuid>
// Returns all repos the logged-in agent has attached in this department
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const department_id = req.nextUrl.searchParams.get("department_id");
  if (!department_id) return NextResponse.json({ error: "department_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("github_integrations")
    .select("id, repo_name, repo_url, created_at")
    .eq("department_id", department_id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ repos: data ?? [] });
}

// POST /api/dev/github/repos
// Body: { department_id, repo_name, repo_url?, access_token }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { department_id, repo_name, repo_url, access_token } = body;

  if (!department_id || !repo_name?.trim() || !access_token?.trim()) {
    return NextResponse.json({ error: "department_id, repo_name, and access_token are required" }, { status: 400 });
  }

  // Mask token for storage — only store first 4 + last 4 chars
  const masked =
    access_token.length > 8
      ? access_token.slice(0, 4) + "****" + access_token.slice(-4)
      : "****";

  const { data, error } = await supabase
    .from("github_integrations")
    .insert({
      department_id,
      user_id: user.id,
      repo_name: repo_name.trim(),
      repo_url: repo_url?.trim() ?? null,
      access_token: masked,
    })
    .select("id, repo_name, repo_url, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ repo: data }, { status: 201 });
}

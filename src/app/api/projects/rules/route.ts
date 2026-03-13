import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
}

async function verifyOwner(supabase: any, projectId: string, userId: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", userId).single();
  return !!data;
}

export async function GET(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!await verifyOwner(supabase, projectId, user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase
    .from("project_rules")
    .select("*")
    .eq("project_id", projectId)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false });

  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { projectId, rule_text, severity } = await req.json();
  if (!projectId || !rule_text) return NextResponse.json({ error: "projectId and rule_text required" }, { status: 400 });
  if (!await verifyOwner(supabase, projectId, user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase.from("project_rules").insert({
    project_id: projectId,
    user_id: user.id,
    rule_text,
    severity: severity ?? 2,
    active: true,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, active } = await req.json();
  if (!id || active === undefined) return NextResponse.json({ error: "id and active required" }, { status: 400 });

  const { data, error } = await supabase
    .from("project_rules")
    .update({ active })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

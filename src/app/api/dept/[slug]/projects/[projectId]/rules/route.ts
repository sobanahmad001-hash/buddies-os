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

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { dept } = await resolveDeptForUser(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const active = req.nextUrl.searchParams.get("active");
  let query = supabase.from("dept_project_rules")
    .select("id, rule_text, severity, active, created_at, user_id")
    .eq("dept_project_id", projectId)
    .order("severity").order("created_at");

  if (active !== null) query = query.eq("active", active === "true");

  const { data } = await query;
  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { dept } = await resolveDeptForUser(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { rule_text, severity = 2 } = await req.json();
  if (!rule_text?.trim()) return NextResponse.json({ error: "rule_text required" }, { status: 400 });

  const { data, error } = await supabase.from("dept_project_rules").insert({
    dept_project_id: projectId,
    user_id: user.id,
    rule_text: rule_text.trim(),
    severity,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { dept } = await resolveDeptForUser(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, active, rule_text, severity } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (active    !== undefined) updates.active    = active;
  if (rule_text !== undefined) updates.rule_text = rule_text;
  if (severity  !== undefined) updates.severity  = severity;

  const { data, error } = await supabase.from("dept_project_rules").update(updates).eq("id", id).eq("user_id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { dept } = await resolveDeptForUser(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("dept_project_rules").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

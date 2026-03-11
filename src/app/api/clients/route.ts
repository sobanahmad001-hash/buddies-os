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

export async function GET() {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ clients: [] });

  // Owner sees all; members see only granted clients
  const { data: ws } = await supabase.from("workspaces").select("id, owner_id").eq("owner_id", user.id).maybeSingle();
  if (ws) {
    const { data } = await supabase.from("clients").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false });
    return NextResponse.json({ clients: data ?? [] });
  }

  // Team member — check workspace membership and client_access
  const { data: mem } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!mem) return NextResponse.json({ clients: [] });
  const { data: access } = await supabase.from("client_access").select("client_id").eq("user_id", user.id);
  const clientIds = (access ?? []).map((a: any) => a.client_id);
  if (!clientIds.length) return NextResponse.json({ clients: [] });
  const { data } = await supabase.from("clients").select("*").in("id", clientIds).order("created_at", { ascending: false });
  return NextResponse.json({ clients: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  if (!ws) return NextResponse.json({ error: "No workspace" }, { status: 404 });
  const body = await req.json();
  const { data, error } = await supabase.from("clients")
    .insert({ ...body, workspace_id: ws.id, created_by: user.id, status: body.status ?? "active" })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-seed 14 stages
  const STAGES = [
    { n: 1,  name: "Brand Identity Story",    dept: "content" },
    { n: 2,  name: "Product Structure",        dept: "content" },
    { n: 3,  name: "Keyword Research",         dept: "seo" },
    { n: 4,  name: "Page Content Writing",     dept: "content" },
    { n: 5,  name: "Figma Design",             dept: "design" },
    { n: 6,  name: "Development Execution",    dept: "development" },
    { n: 7,  name: "On-Page SEO",              dept: "seo" },
    { n: 8,  name: "Technical SEO",            dept: "seo" },
    { n: 9,  name: "Keyword Ranking Reports",  dept: "seo" },
    { n: 10, name: "Blog Content Calendar",    dept: "content" },
    { n: 11, name: "Backlinks / Off-Page SEO", dept: "seo" },
    { n: 12, name: "GMB + Bing Webmaster",     dept: "seo" },
    { n: 13, name: "Social Media Setup",       dept: "marketing" },
    { n: 14, name: "Social Content Calendar",  dept: "marketing" },
  ];
  await supabase.from("client_stages").insert(
    STAGES.map(s => ({ client_id: data.id, stage_number: s.n, stage_name: s.name, department: s.dept, status: "not_started" }))
  );
  return NextResponse.json({ client: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...updates } = await req.json();
  const { error } = await supabase.from("clients").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

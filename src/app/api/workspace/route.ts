import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });
}

export async function GET() {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ workspace: null });

  // Get workspace where owner or member
  const { data: owned } = await supabase.from("workspaces").select("*, memberships(id,user_id,role,status,invited_email)").eq("owner_id", user.id).single();
  if (owned) return NextResponse.json({ workspace: owned, role: "owner" });

  const { data: membership } = await supabase.from("memberships").select("*, workspaces(*)").eq("user_id", user.id).eq("status", "active").single();
  if (membership) return NextResponse.json({ workspace: membership.workspaces, role: membership.role });

  return NextResponse.json({ workspace: null });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { data, error } = await supabase.from("workspaces").insert({ name, owner_id: user.id, slug }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-add owner as member
  await supabase.from("memberships").insert({ workspace_id: data.id, user_id: user.id, role: "owner", status: "active" });

  return NextResponse.json({ workspace: data });
}

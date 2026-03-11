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
  if (!user) return NextResponse.json({ departments: [] });
  const { data: mem } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!mem) return NextResponse.json({ departments: [] });
  const { data } = await supabase.from("departments").select("*").eq("workspace_id", mem.workspace_id).order("name");
  return NextResponse.json({ departments: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { member_id, department_id } = await req.json();
  const { error } = await supabase.from("memberships").update({ department_id }).eq("id", member_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });
}

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ activity: [] });
  const dept_id = req.nextUrl.searchParams.get("dept_id");
  if (!dept_id) return NextResponse.json({ activity: [] });
  const { data } = await supabase.from("department_activity").select("*")
    .eq("department_id", dept_id).order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ activity: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { department_id, activity_type, title, content, metadata } = await req.json();
  const { data, error } = await supabase.from("department_activity")
    .insert({ department_id, user_id: user.id, activity_type, title, content, metadata })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data });
}

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

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const client_id = req.nextUrl.searchParams.get("client_id");
  if (!client_id) return NextResponse.json({ stages: [] });
  const { data } = await supabase.from("client_stages").select("*").eq("client_id", client_id).order("stage_number");
  return NextResponse.json({ stages: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await sb();
  const { id, ...updates } = await req.json();
  if (updates.status === "done") updates.completed_at = new Date().toISOString();
  updates.updated_at = new Date().toISOString();
  const { error } = await supabase.from("client_stages").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

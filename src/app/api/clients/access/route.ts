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
  if (!client_id) return NextResponse.json({ access: [] });
  const { data } = await supabase.from("client_access").select("*").eq("client_id", client_id);
  return NextResponse.json({ access: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client_id, user_id } = await req.json();
  const { error } = await supabase.from("client_access")
    .upsert({ client_id, user_id, granted_by: user.id }, { onConflict: "client_id,user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ granted: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { client_id, user_id } = await req.json();
  await supabase.from("client_access").delete().eq("client_id", client_id).eq("user_id", user_id);
  return NextResponse.json({ revoked: true });
}

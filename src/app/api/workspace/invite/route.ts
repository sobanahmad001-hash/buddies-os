import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSupabase() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { email, role = "agent", workspace_id } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!workspace_id) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  const { data, error } = await supabase.from("workspace_invites").insert({
    workspace_id, invited_by: user.id, email: email.trim(), role
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://buddies-os.vercel.app"}/join?token=${data.token}`;
  return NextResponse.json({ invite: data, inviteUrl });
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ invites: [] });
  const wsId = req.nextUrl.searchParams.get("workspace_id");
  if (!wsId) return NextResponse.json({ invites: [] });
  const { data } = await supabase.from("workspace_invites").select("*")
    .eq("workspace_id", wsId).order("created_at", { ascending: false });
  return NextResponse.json({ invites: data ?? [] });
}
